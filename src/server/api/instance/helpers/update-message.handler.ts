import type { WAMessageUpdateCallback } from '@server/services/whatsapp/whatsapp-instance.type';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { app } from '@server/index';

const updateTimeout = new Map<string, NodeJS.Timeout>();

export const updateMessageHandler: WAMessageUpdateCallback = async (messageId, data) => {
  clearTimeout(updateTimeout.get(messageId));

  updateTimeout.set(
    messageId,
    setTimeout(async () => {
      await WhatsAppMessage.updateOne({ messageId }, { $set: data });
      updateTimeout.delete(messageId);
    }, 2000)
  );

  // Broadcast status update to connected clients
  app.socket.broadcast(ConversationEventEnum.MESSAGE_STATUS_UPDATE, { ...data, messageId });
};
