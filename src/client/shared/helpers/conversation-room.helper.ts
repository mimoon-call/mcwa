// src/client/shared/helpers/room.helper.ts
import getClientSocket from './get-client-socket.helper';
import { ConversationEventEnum } from '@client/pages/Chat/store/chat-event.enum';

/**
 * Join a room to receive live updates
 * @param roomKey - The room key to join
 */
export const joinRoom = (roomKey: string): void => {
  const socket = getClientSocket();
  if (socket) {
    socket.emit(ConversationEventEnum.JOIN_ROOM, { roomKey });
  }
};

/**
 * Leave a room to stop receiving live updates
 * @param roomKey - The room key to leave
 */
export const leaveRoom = (roomKey: string): void => {
  const socket = getClientSocket();
  if (socket) {
    socket.emit(ConversationEventEnum.LEAVE_ROOM, { roomKey });
  }
};

/**
 * Join a conversation room to receive live updates for a specific conversation
 * @param phoneNumber - The instance phone number
 * @param withPhoneNumber - The contact phone number
 */
export const joinConversationRoom = (phoneNumber: string, withPhoneNumber: string): void => {
  const conversationKey = getConversationKey(phoneNumber, withPhoneNumber);
  joinRoom(conversationKey);
};

/**
 * Leave a conversation room to stop receiving live updates for a specific conversation
 * @param phoneNumber - The instance phone number
 * @param withPhoneNumber - The contact phone number
 */
export const leaveConversationRoom = (phoneNumber: string, withPhoneNumber: string): void => {
  const conversationKey = getConversationKey(phoneNumber, withPhoneNumber);
  leaveRoom(conversationKey);
};

/**
 * Generate conversation key from phone numbers
 * @param phoneNumber - The instance phone number
 * @param withPhoneNumber - The contact phone number
 * @returns The conversation key
 */
export const getConversationKey = (phoneNumber: string, withPhoneNumber: string): string => {
  return `conversation:${phoneNumber}:${withPhoneNumber}`;
};
