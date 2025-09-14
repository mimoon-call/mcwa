// src/client/pages/Chat/store/chat-message-handler.ts
import type { ChatMessage, GlobalChatContact } from './chat.types';
import type { ChatContact } from './chat.types';
import { findAndUpdateMessage, updateConversationInList } from './chat.utils';
import { MessageHandlerActionEnum } from './chat.enum';

// Generic message handler that can be used by both Chat and Instance slices
export const handleIncomingMessage = (
  state: Record<string, unknown>,
  messagesDataKey: string,
  searchDataKey: string,
  newMessage: ChatMessage,
  isGlobalChat: boolean = false
) => {
  const existingMessages = (state[messagesDataKey] as ChatMessage[]) || [];

  const { action, index } = findAndUpdateMessage(existingMessages, newMessage);

  switch (action) {
    case MessageHandlerActionEnum.UPDATE: {
      // Update existing message
      const existingMsg = (state[messagesDataKey] as ChatMessage[])?.[index!];
      if (existingMsg) {
        Object.assign(existingMsg, newMessage);
        if (existingMsg.isOptimistic) {
          existingMsg.isOptimistic = false;
        }
      }
      break;
    }
    case MessageHandlerActionEnum.REPLACE: {
      // Replace optimistic message
      const optimisticMsg = (state[messagesDataKey] as ChatMessage[])?.[index!];
      if (optimisticMsg) {
        Object.assign(optimisticMsg, newMessage);
        optimisticMsg.isOptimistic = false;
        optimisticMsg.tempId = undefined;
      }
      break;
    }
    case MessageHandlerActionEnum.ADD: {
      // Add new message
      state[messagesDataKey] = [...existingMessages, newMessage];
      break;
    }
  }

  // Update conversations list
  if (state[searchDataKey]) {
    if (isGlobalChat) {
      const conversations = state[searchDataKey] as GlobalChatContact[];
      state[searchDataKey] = updateConversationInList(conversations, newMessage, isGlobalChat);
    } else {
      const conversations = state[searchDataKey] as ChatContact[];
      state[searchDataKey] = updateConversationInList(conversations, newMessage, isGlobalChat);
    }
  }
};

// Generic optimistic message handler
export const handleOptimisticMessage = (
  state: Record<string, unknown>,
  messagesDataKey: string,
  optimisticMessage: ChatMessage
) => {
  // Add optimistic message to the end of the array
  if (!state[messagesDataKey]) {
    state[messagesDataKey] = [];
  }
  (state[messagesDataKey] as ChatMessage[]).push(optimisticMessage);
};

// Generic message status update handler
export const handleMessageStatusUpdate = (
  state: Record<string, unknown>,
  messagesDataKey: string,
  payload: {
    messageId: string;
    status: string;
    sentAt?: string;
    deliveredAt?: string;
    readAt?: string;
    playedAt?: string;
    errorCode?: string;
    errorMessage?: string;
  }
) => {
  const existingMessages = (state[messagesDataKey] as ChatMessage[]) || [];

  // Find and update the message with the matching messageId
  const messageIndex = existingMessages.findIndex((msg: ChatMessage) => msg.messageId === payload.messageId);

  if (messageIndex !== -1) {
    const updatedMessage = {
      ...existingMessages[messageIndex],
      ...(payload.status && { status: payload.status }),
      ...(payload.sentAt && { sentAt: payload.sentAt }),
      ...(payload.deliveredAt && { deliveredAt: payload.deliveredAt }),
      ...(payload.readAt && { readAt: payload.readAt }),
      ...(payload.playedAt && { playedAt: payload.playedAt }),
      ...(payload.errorCode && { errorCode: payload.errorCode }),
      ...(payload.errorMessage && { errorMessage: payload.errorMessage }),
    };

    state[messagesDataKey] = existingMessages.map((msg: ChatMessage, index: number) =>
      index === messageIndex ? updatedMessage : msg
    );
  }
};

// Generic optimistic message status update handler
export const handleOptimisticMessageStatusUpdate = (
  state: Record<string, unknown>,
  messagesDataKey: string,
  payload: { tempId: string; status: string; errorMessage?: string }
) => {
  const existingMessages = (state[messagesDataKey] as ChatMessage[]) || [];

  const messageIndex = existingMessages.findIndex(
    (msg: ChatMessage) => msg.tempId === payload.tempId && msg.isOptimistic
  );

  if (messageIndex !== -1) {
  const messageToUpdate = (state[messagesDataKey] as ChatMessage[])?.[messageIndex];

  if (messageToUpdate) {
    messageToUpdate.status = payload.status;
    if (payload.errorMessage) {
      messageToUpdate.errorMessage = payload.errorMessage;
    }
    if (payload.status === 'DELIVERED') {
      messageToUpdate.sentAt = new Date().toISOString();
    }
    messageToUpdate.isOptimistic = true;
  }
  }
};
