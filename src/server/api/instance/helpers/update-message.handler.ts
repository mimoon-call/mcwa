import type { WAMessageUpdateCallback } from '@server/services/whatsapp/whatsapp-instance.type';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { app } from '@server/index';
import { LRUCache } from 'lru-cache';

const lastUpdate = new LRUCache<string, string>({ max: 10000, ttl: 1000 * 60 }); // Cache last status for 1 minute

export const updateMessageHandler: WAMessageUpdateCallback = async (messageId, data) => {
  const lastStatus = lastUpdate.get(messageId);
  lastUpdate.set(messageId, data.status);

  if (lastStatus === data.status) return;

  await WhatsAppMessage.updateOne({ messageId }, { $set: data });

  // Broadcast status update to connected clients
  app.socket.broadcast(ConversationEventEnum.MESSAGE_STATUS_UPDATE, { ...data, messageId });
};
