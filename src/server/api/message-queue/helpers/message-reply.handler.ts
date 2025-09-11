// message-reply.handler.ts
import { ObjectId } from 'mongodb';
import { WhatsAppMessage, WhatsAppUnsubscribe } from '@server/services/whatsapp/whatsapp.db';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { classifyInterest, InterestResult } from '@server/api/message-queue/reply/interest.classifier';
import { wa, app } from '@server/index';
import { LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { sendMessageToSocketRoom } from '@server/helpers/send-message-to-socket-room.helper';

type TranscriptItem = { from: 'LEAD' | 'YOU'; text: string; at?: string };

const replyTimeout = new Map<string, NodeJS.Timeout>();

const handleWebhook = async (phoneNumber: string, text: string, ai: InterestResult) => {
  switch (ai.department) {
    case LeadDepartmentEnum.CAR:
      console.log('CAR LEAD WEBHOOK', { phoneNumber, text, comment: ai.reason, followUpAt: ai.followUpAt });
      break;
    case LeadDepartmentEnum.MORTGAGE:
      console.log('MORTGAGE LEAD WEBHOOK', { phoneNumber, text, comment: ai.reason, followUpAt: ai.followUpAt });
      break;
    case LeadDepartmentEnum.GENERAL:
      console.log('GENERAL LEAD WEBHOOK', { phoneNumber, text, comment: ai.reason, followUpAt: ai.followUpAt });
      break;
  }
};

const handleAiInterest = async (phoneNumber: string, text: string, ai: InterestResult | null) => {
  if (!ai) return;

  switch (ai?.intent) {
    case LeadIntentEnum.UNSUBSCRIBE: {
      await WhatsAppUnsubscribe.findOneAndUpdate(
        { phoneNumber },
        { $set: { text, intent: ai.intent, reason: ai.reason, confidence: ai.confidence }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );

      // unsubscribe webhook

      break;
    }

    case LeadIntentEnum.NEUTRAL:
    case LeadIntentEnum.REQUEST_INFO:
    case LeadIntentEnum.POSITIVE_INTEREST:
    case LeadIntentEnum.NOT_NOW:
      await handleWebhook(phoneNumber, text, ai);
      break;
  }
};

export const messageReplyHandler = async (id: ObjectId): Promise<void> => {
  const { fromNumber, toNumber, messageId, text, sentAt } = await (async () => {
    const message = await WhatsAppMessage.findOne({ _id: id });

    if (!message) return {};

    sendMessageToSocketRoom(message);

    // Broadcast new message event
    const messageData = {
      fromNumber: message.fromNumber,
      toNumber: message.toNumber,
      text: message.text,
      createdAt: message.createdAt,
      status: message.status,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      playedAt: message.playedAt,
      messageId: message.messageId,
    };

    // Send message to specific conversation room instead of broadcasting
    const conversationKey = `conversation:${message.fromNumber}:${message.toNumber}`;
    app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_MESSAGE, messageData);

    // Send conversation update to specific conversation room
    const conversationData = {
      name: message.raw?.pushName || message.toNumber,
      phoneNumber: message.toNumber,
      instanceNumber: message.fromNumber,
      lastMessage: message.text || '',
      lastMessageAt: message.createdAt,
      action: message.action,
      confidence: message.confidence,
      department: message.department,
      interested: message.interested,
      reason: message.reason,
    };

    app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_CONVERSATION, conversationData);

    const startMessage = await MessageQueueDb.findOne(
      { phoneNumber: message.fromNumber, instanceNumber: message.toNumber, sentAt: { $exists: true } },
      null,
      { sort: { sentAt: -1 } }
    );

    if (!startMessage?.messageId) return {};

    return {
      messageId: startMessage.messageId,
      text: startMessage.textMessage,
      fromNumber: message.fromNumber,
      toNumber: message.toNumber,
      sentAt: startMessage.sentAt,
    };
  })();

  if (!messageId || !sentAt) {
    return;
  }

  const conversationKey = [fromNumber, toNumber].sort().join(':');

  // If already processing this conversation, skip
  if (replyTimeout.has(conversationKey)) {
    return;
  }

  // clear any pending debounce for this outreach
  clearTimeout(replyTimeout.get(conversationKey));

  const handle = setTimeout(
    async () => {
      try {
        console.log('handler started for', conversationKey);
        const leadNumber = fromNumber; // LEAD
        const yourNumber = toNumber; // YOU

        const originalMessage = await WhatsAppMessage.findOne({
          messageId,
          $or: [
            { fromNumber: leadNumber, toNumber: yourNumber },
            { fromNumber: yourNumber, toNumber: leadNumber },
          ],
        });

        if (!originalMessage?.createdAt) {
          return;
        }

        const allPreviousMessages = await WhatsAppMessage.find(
          {
            createdAt: { $gte: new Date(originalMessage.createdAt) },
            $or: [
              { fromNumber: leadNumber, toNumber: yourNumber },
              { fromNumber: yourNumber, toNumber: leadNumber },
            ],
          },
          { text: 1, createdAt: 1, fromNumber: 1, toNumber: 1 },
          { sort: { createdAt: 1 }, lean: true }
        );

        // role-aware, ordered transcript (skip empty texts)
        const leadReplies: TranscriptItem[] = allPreviousMessages
          .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0)
          .map((m) => ({
            from: m.fromNumber === leadNumber ? 'LEAD' : 'YOU',
            text: m.text!.trim(),
            at: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)).toISOString(),
          }));

        const svc = new OpenAiService();

        try {
          const ai = await classifyInterest(svc, {
            outreachText: text ?? '',
            leadReplies,
            localeHint: 'he-IL',
            timezone: 'Asia/Jerusalem',
            referenceTimeIso: new Date().toISOString(),
          });

          console.log('INCOMING', `[${fromNumber}]\n`, leadReplies.map((v, i) => `${i + 1}. [${v.from}] ${v.text}`).join('\n'), '\n', ai);

          if (!ai) return;

          // persist classification on the outreach message
          await WhatsAppMessage.updateOne({ _id: originalMessage._id }, { $set: ai });
          await handleAiInterest(leadNumber, text, ai);

          if (ai.suggestedReply) {
            // Check if there are active members in the conversation room
            const conversationKey = `conversation:${yourNumber}:${leadNumber}`;
            const hasActiveMembers = app.socket.hasRoomMembers(conversationKey);

            if (hasActiveMembers) {
              console.log(`[Auto-reply skipped] Conversation room has active members: ${conversationKey} - Human is actively viewing the chat`);
              return; // Skip auto-reply if someone is actively viewing the chat
            }

            console.log(`[Auto-reply proceeding] No active members in conversation room: ${conversationKey} - Sending AI reply`);

            try {
              const sendResult = await wa.sendMessage(yourNumber, leadNumber, ai.suggestedReply, {
                trackDelivery: true,
                waitForDelivery: true,
                onUpdate: (messageId, deliveryStatus) =>
                  app.socket.broadcast(ConversationEventEnum.MESSAGE_STATUS_UPDATE, { messageId, status: deliveryStatus.status }),
              });

              // Broadcast the sent message with actual messageId from WhatsApp
              const sentMessageData = {
                fromNumber: yourNumber,
                toNumber: leadNumber,
                text: ai.suggestedReply,
                createdAt: new Date().toISOString(),
                status: MessageStatusEnum.PENDING,
                sentAt: new Date().toISOString(),
                messageId: sendResult.key!.id,
              };

              // Send message to specific conversation room instead of broadcasting
              app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_MESSAGE, sentMessageData);
            } catch (error) {
              console.error('sendMessage:error', error);
            }
          }
        } catch (e) {
          console.error('classifyInterest:error', e);
        }
      } finally {
        replyTimeout.delete(conversationKey);
      }
    },
    30 * 1000 // 30 seconds debounce per conversation
  );

  replyTimeout.set(conversationKey, handle);
};
