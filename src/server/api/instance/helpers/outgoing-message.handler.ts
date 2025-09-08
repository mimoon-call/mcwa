import type { WAMessageOutgoingCallback } from '@server/services/whatsapp/whatsapp-instance.type';
import getLocalTime from '@server/helpers/get-local-time';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';

export const outgoingMessageHandler: WAMessageOutgoingCallback = async (msg, raw, deliveryStatus) => {
  const messageId = deliveryStatus?.messageId || raw?.key?.id;
  const messageData = { ...msg, raw, messageId, ...(deliveryStatus || {}), createdAt: getLocalTime() };
  await WhatsAppMessage.insertOne(messageData);
};
