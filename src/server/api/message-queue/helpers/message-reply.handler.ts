import { ObjectId } from 'mongodb';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { classifyInterest } from '@server/api/message-queue/reply/interest.classifier';
import { wa } from '@server/index';

const replyTimeout = new Map<string, NodeJS.Timeout>();

// Helper types for clarity
type TranscriptItem = {
  from: 'LEAD' | 'YOU';
  text: string;
  at?: string; // ISO string (optional but useful)
};

export const messageReplyHandler = async (messageId: ObjectId): Promise<void> => {
  const message = await WhatsAppMessage.findOne({ _id: messageId });
  if (!message) return;

  // last outbound you sent to this lead
  const previousMessage = await WhatsAppMessage.findOne({ toNumber: message.fromNumber, fromNumber: message.toNumber }, null, {
    sort: { createdAt: -1 },
  });

  if (!previousMessage) return;

  const timeoutKey = previousMessage._id.toString();

  // clear any pending debounce for this outreach
  clearTimeout(replyTimeout.get(timeoutKey));

  const handle = setTimeout(
    async () => {
      const leadNumber = message.fromNumber; // LEAD
      const yourNumber = message.toNumber; // YOU

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
          outreachText: previousMessage.text ?? '',
          leadReplies,
          localeHint: 'he-IL',
          timezone: 'Asia/Jerusalem',
          referenceTimeIso: new Date().toISOString(),
        });

        console.log('INCOMING', `[${message.fromNumber}]\n`, leadReplies.map((v, i) => `${i + 1}. [${v.from}] ${v.text}`).join('\n'), '\n', ai);

        if (!ai) return;

        // persist classification on the outreach message
        await WhatsAppMessage.updateOne({ _id: previousMessage._id }, { $set: ai });

        if (ai.suggestedReply) {
          try {
            await wa.sendMessage(yourNumber, leadNumber, ai.suggestedReply);
          } catch (sendErr) {
            console.error('sendMessage:error', sendErr);
          }
        }
      } catch (e) {
        console.error('classifyInterest:error', e);
      } finally {
        replyTimeout.delete(timeoutKey);
      }
    },
    60 * 1000 // 1 minute debounce
  );

  replyTimeout.set(timeoutKey, handle);
};
