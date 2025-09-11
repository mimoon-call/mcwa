import type { WAMessageUpdateCallback } from '@server/services/whatsapp/whatsapp-instance.type';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { app } from '@server/index';

export const updateMessageHandler: WAMessageUpdateCallback = async (
  messageId,
  { status, sentAt, deliveredAt, readAt, playedAt, errorMessage, errorCode }
) => {
  console.log(`Message ${messageId} status updated to ${status}`);
  await WhatsAppMessage.updateOne({ messageId }, { $set: { status, sentAt, deliveredAt, readAt, playedAt, errorMessage, errorCode } });

  // Broadcast status update to connected clients
  app.socket.broadcast(ConversationEventEnum.MESSAGE_STATUS_UPDATE, {
    messageId,
    status,
    sentAt,
    deliveredAt,
    readAt,
    playedAt,
    errorCode,
    errorMessage,
  });
};
