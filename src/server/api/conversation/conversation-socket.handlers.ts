// src/server/api/conversation/conversation-socket.handlers.ts
import type { SocketManage } from '@server/services/socket/socket-server';
import { conversationService } from './conversation.service';
import { ConversationEventEnum } from './conversation-event.enum';
import { SocketService } from '@server/services/socket/socket.service';
import { AccessToken } from '@server/services/token/token.type';
import { SEND_MESSAGE } from '@server/api/conversation/conversation.map';

export const registerConversationSocketHandlers = (socketService: SocketService<AccessToken>) => {
  // Handler for sending messages via socket
  socketService.registerHandler(
    ConversationEventEnum.SEND_MESSAGE,
    async (socket: SocketManage<AccessToken>, data: { fromNumber: string; toNumber: string; textMessage: string; tempId: string }) => {
      try {
        // Send the message using the existing service
        const result = await conversationService[SEND_MESSAGE](data.fromNumber, data.toNumber, data.textMessage);

        if (result.returnCode === 0) {
          // Send success response back to client
          socket.emit(ConversationEventEnum.MESSAGE_SENT, {
            success: true,
            tempId: data.tempId,
            returnCode: result.returnCode,
          });

          // The real message will be sent via the existing NEW_MESSAGE event
          // which will replace the optimistic message on the client side
        } else {
          // Send error response
          socket.emit(ConversationEventEnum.MESSAGE_SENT, {
            success: false,
            tempId: data.tempId,
            returnCode: result.returnCode,
            error: 'Message sending failed',
          });
        }
      } catch (error) {
        socket.emit(ConversationEventEnum.MESSAGE_SENT, {
          success: false,
          tempId: data.tempId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};
