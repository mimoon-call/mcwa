// message-reply.handler.ts
import { ObjectId } from 'mongodb';
import { WhatsAppMessage, WhatsAppUnsubscribe } from '@server/services/whatsapp/whatsapp.db';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { classifyInterest, InterestResult } from '@server/api/message-queue/reply/interest.classifier';
import { wa } from '@server/index';
import { LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';

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
  const { fromNumber, toNumber, startId, text } = await (async () => {
    const message = await WhatsAppMessage.findOne({ _id: id });
    if (!message) return {};

    const startMessage = await WhatsAppMessage.findOne({ toNumber: message.fromNumber, fromNumber: message.toNumber }, null, {
      sort: { createdAt: -1 },
    });

    if (!startMessage) return {};

    return { startId: startMessage._id, text: startMessage.text, fromNumber: message.fromNumber, toNumber: message.toNumber };
  })();

  if (!startId) return;

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
        const leadNumber = fromNumber; // LEAD
        const yourNumber = toNumber; // YOU

        // === NEW: collect a full 12h window, both directions, between the same pair ===
        const WINDOW_HOURS = 12;
        const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

        const allPreviousMessages = await WhatsAppMessage.find(
          {
            createdAt: { $gte: windowStart },
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
          await WhatsAppMessage.updateOne({ _id: startId }, { $set: ai });

          await handleAiInterest(leadNumber, text, ai);

          if (ai.suggestedReply) {
            try {
              await wa.sendMessage(yourNumber, leadNumber, ai.suggestedReply);
            } catch (sendErr) {
              console.error('sendMessage:error', sendErr);
            }
          }
        } catch (e) {
          console.error('classifyInterest:error', e);
        }
      } finally {
        replyTimeout.delete(conversationKey);
      }
    },
    30 * 1000 // 30 seconds debounce
  );

  replyTimeout.set(conversationKey, handle);
};
