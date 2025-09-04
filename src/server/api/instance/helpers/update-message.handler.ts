import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import type { WAMessageUpdateCallback } from '@server/services/whatsapp/whatsapp-instance.type';

export const updateMessageHandler: WAMessageUpdateCallback = async (messageId, { status, sentAt, deliveredAt, errorMessage, errorCode }) => {
  await WhatsAppMessage.updateOne({ messageId }, { $set: { status, sentAt, deliveredAt, errorMessage, errorCode } });
};
