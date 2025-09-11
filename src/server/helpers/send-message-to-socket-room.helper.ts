// src/server/helpers/send-message-to-socket-room.helper.ts
import { app, wa } from '@server/index';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { MessageDocument } from '@server/services/whatsapp/whatsapp.type';

export interface SendMessageToSocketRoomResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export const sendMessageToSocketRoom = (message: MessageDocument): void => {
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

  // Emit to conversation room
  const conversationKey = `conversation:${message.toNumber}:${message.fromNumber}`;
  app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_MESSAGE, messageData);

  if (app.socket.hasRoomMembers(conversationKey)) {
    const instance = wa.getInstance(message.toNumber);
    instance?.read(message.raw.key);
  }
};
