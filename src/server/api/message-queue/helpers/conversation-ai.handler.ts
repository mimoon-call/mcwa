// message-reply.handler.ts
import type { MessageDocument } from '@server/services/whatsapp/whatsapp.type';
import { ObjectId } from 'mongodb';
import { WhatsAppMessage, WhatsAppUnsubscribe } from '@server/services/whatsapp/whatsapp.db';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { classifyInterest } from '@server/api/message-queue/reply/interest.classifier';
import { wa, app } from '@server/index';
import { LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';
import { WhatsappQueue } from '@server/api/message-queue/whatsapp.queue';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { sendMessageToSocketRoom } from '@server/helpers/send-message-to-socket-room.helper';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import { MessageQueueItem, NewOpportunityEvent } from '@server/api/message-queue/message-queue.types';
import { HttpService } from '@services/http/http.service';
import logger from '@server/helpers/logger';

type TranscriptItem = { from: 'LEAD' | 'YOU'; text: string; at?: string };
type Options = Partial<{ debounceTime: number; sendAutoReplyFlag: boolean; callWebhookFlag: boolean; instanceNumber: string }>;
export type LeadWebhookPayload = Omit<MessageDocument, 'raw'> & Partial<Pick<MessageQueueItem, 'initiatorMessageId' | 'metaTemplateId'>>;

const replyTimeout = new Map<string, NodeJS.Timeout>();

const handleWebhook = async (doc: MessageDocument) => {
  const webhookRequest = (() => {
    const url = process.env.LEAD_WEBHOOK_URL as undefined | `https://${string}`;

    if (!url) {
      console.error('WEBHOOK', 'No webhook URL configured');

      return null;
    }

    const api = new HttpService({ baseURL: url, timeout: 30 * 1000, headers: { 'Content-type': 'application/json; charset=UTF-8' } });

    return (payload: LeadWebhookPayload) => api.post<void, LeadWebhookPayload>('', payload, { signatureKey: process.env.WEBHOOK_SECRET });
  })();

  const additionalData = (
    await WhatsappQueue.aggregate([
      { $match: { $and: [{ instanceNumber: doc.fromNumber, phoneNumber: doc.toNumber, messageId: doc.messageId }, { sentAt: { $exists: true } }] } },
      { $sort: { sentAt: 1 } },
      { $limit: 1 },
      { $project: { _id: 0, metaTemplateId: 1, initiatorMessageId: 1, department: 1 } },
    ])
  )[0];

  const phoneNumber = doc.toNumber;
  const instanceNumber = doc.fromNumber;
  const text = doc.text || '';
  const webhookPayload = { ...doc, ...(additionalData || {}) };

  if (doc.interested) {
    app.socket.broadcast<NewOpportunityEvent>(MessageQueueEventEnum.NEW_OPPORTUNITY, {
      phoneNumber,
      instanceNumber,
      text,
      department: doc.department,
      ...(additionalData || {}),
    });
  }

  webhookRequest?.(webhookPayload).catch(() => {
    console.error('handleWebhook:failed', process.env.LEAD_WEBHOOK_URL);
  });
};

const handleAiInterest = async (doc: MessageDocument) => {
  switch (doc?.intent) {
    case LeadIntentEnum.UNSUBSCRIBE: {
      await WhatsAppUnsubscribe.findOneAndUpdate(
        { phoneNumber: doc.toNumber },
        { $set: { text: doc.text, intent: doc.intent, reason: doc.reason, confidence: doc.confidence }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );

      // unsubscribe webhook

      break;
    }
  }

  await handleWebhook(doc);
};

export const conversationAiHandler = async (id: ObjectId, options?: Options): Promise<void> => {
  const { debounceTime = 15000, sendAutoReplyFlag = true, callWebhookFlag = true } = options || {};
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

    const startMessage = await WhatsappQueue.findOne(
      {
        $and: [
          {
            $or: [
              { phoneNumber: message.fromNumber, instanceNumber: message.toNumber },
              { phoneNumber: message.toNumber, instanceNumber: message.fromNumber },
            ],
          },
          { sentAt: { $exists: true } },
        ],
      },
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

  if (!messageId || !sentAt) return;

  const conversationKey = [fromNumber, toNumber].sort().join(':');

  // If already processing this conversation, skip
  if (replyTimeout.has(conversationKey)) {
    return;
  }

  // clear any pending debounce for this outreach
  clearTimeout(replyTimeout.get(conversationKey));

  const handle = setTimeout(async () => {
    try {
      logger.debug('conversationAiHandler', 'started for', conversationKey);
      const phoneNumber1 = fromNumber;
      const phoneNumber2 = toNumber;

      const originalMessage = await WhatsAppMessage.findOne({
        messageId,
        $or: [
          { fromNumber: phoneNumber1, toNumber: phoneNumber2 },
          { fromNumber: phoneNumber2, toNumber: phoneNumber1 },
        ],
      });

      if (!originalMessage?.createdAt) return;

      const allPreviousMessages = await WhatsAppMessage.find(
        {
          createdAt: { $gte: new Date(originalMessage.createdAt) },
          $or: [
            { fromNumber: phoneNumber1, toNumber: phoneNumber2 },
            { fromNumber: phoneNumber2, toNumber: phoneNumber1 },
          ],
        },
        { text: 1, createdAt: 1, fromNumber: 1, toNumber: 1 },
        { sort: { createdAt: 1 }, lean: true }
      );

      let primaryNumber: string | undefined = options?.instanceNumber || undefined;

      // role-aware, ordered transcript (skip empty texts)
      const leadReplies: TranscriptItem[] = allPreviousMessages
        .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0)
        .map((m, index) => {
          if (!primaryNumber && index === 0) primaryNumber = m.fromNumber;

          return {
            from: m.fromNumber === primaryNumber ? 'YOU' : 'LEAD',
            text: m.text!.trim(),
            at: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)).toISOString(),
          };
        });

      const svc = new OpenAiService();

      try {
        const ai = await classifyInterest(svc, {
          outreachText: text ?? '',
          leadReplies,
          localeHint: 'he-IL',
          timezone: 'Asia/Jerusalem',
          referenceTimeIso: new Date().toISOString(),
        });

        logger.debug('INCOMING', `[${fromNumber}]\n`, leadReplies.map((v, i) => `${i + 1}. [${v.from}] ${v.text}`).join('\n'), '\n', ai);

        if (!ai) return;

        // persist classification on the outreach message
        const doc = await WhatsAppMessage.findOneAndUpdate(
          { _id: originalMessage._id },
          { $set: ai },
          {
            returnDocument: 'after',
            projection: { __v: 0, internalFlag: 0, warmingFlag: 0, raw: 0 },
          }
        );

        if (callWebhookFlag && doc) await handleAiInterest(doc.toObject());

        if (ai.suggestedReply && sendAutoReplyFlag) {
          // Check if there are active members in the conversation room
          const conversationKey = `conversation:${phoneNumber2}:${phoneNumber1}`;
          const hasActiveMembers = app.socket.hasRoomMembers(conversationKey);

          if (hasActiveMembers) {
            logger.debug(`[Auto-reply skipped] Conversation room has active members: ${conversationKey} - Human is actively viewing the chat`);
            return; // Skip auto-reply if someone is actively viewing the chat
          }

          logger.debug(`[Auto-reply proceeding] No active members in conversation room: ${conversationKey} - Sending AI reply`);

          try {
            const sendResult = await wa.sendMessage(phoneNumber2, phoneNumber1, ai.suggestedReply, {
              trackDelivery: true,
              waitForDelivery: true,
              onUpdate: (messageId, deliveryStatus) =>
                app.socket.broadcast(ConversationEventEnum.MESSAGE_STATUS_UPDATE, { messageId, status: deliveryStatus.status }),
            });

            // Broadcast the sent message with actual messageId from WhatsApp
            const sentMessageData = {
              fromNumber: phoneNumber2,
              toNumber: phoneNumber1,
              text: ai.suggestedReply,
              createdAt: new Date().toISOString(),
              status: MessageStatusEnum.PENDING,
              sentAt: new Date().toISOString(),
              messageId: sendResult.key!.id,
            };

            // Send message to specific conversation room instead of broadcasting
            app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_MESSAGE, sentMessageData);
          } catch (error) {
            logger.error('sendMessage:error', error);
          }
        }
      } catch (e) {
        logger.error('classifyInterest:error', e);
      }
    } finally {
      replyTimeout.delete(conversationKey);
    }
  }, debounceTime);

  replyTimeout.set(conversationKey, handle);
};
