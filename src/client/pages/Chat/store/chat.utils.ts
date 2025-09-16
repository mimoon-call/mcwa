// src/client/pages/Chat/store/chat.utils.ts
import type { ChatMessage, GlobalChatContact } from './chat.types';
import type { ChatContact } from './chat.types';
import { MessageHandlerActionEnum } from './chat.enum';

// Helper function to deduplicate messages by messageId, keeping the last occurrence
export const deduplicateMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const seen = new Map<string, ChatMessage>();
  const messagesWithoutId: ChatMessage[] = [];

  // Process messages in order, keeping the last occurrence of each messageId
  messages.forEach((message) => {
    if (message.messageId) {
      seen.set(message.messageId, message);
    } else {
      // For messages without messageId, we need to deduplicate by other criteria
      // Use a combination of fromNumber, toNumber, text, and createdAt as a unique key
      const existingIndex = messagesWithoutId.findIndex(msg => 
        msg.fromNumber === message.fromNumber &&
        msg.toNumber === message.toNumber &&
        msg.text === message.text &&
        msg.createdAt === message.createdAt
      );
      
      if (existingIndex === -1) {
        messagesWithoutId.push(message);
      } else {
        // Replace with newer message if timestamps are different
        const existingMessage = messagesWithoutId[existingIndex];
        if (new Date(message.createdAt) > new Date(existingMessage.createdAt)) {
          messagesWithoutId[existingIndex] = message;
        }
      }
    }
  });

  const deduplicatedMessages = Array.from(seen.values());
  
  // Sort all messages by createdAt to maintain chronological order
  const allMessages = [...messagesWithoutId, ...deduplicatedMessages];
  return allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

// Helper function to deduplicate conversations by phoneNumber+instanceNumber, keeping the last occurrence
export const deduplicateGlobalConversations = (conversations: GlobalChatContact[]): GlobalChatContact[] => {
  const seen = new Map<string, GlobalChatContact>();

  // Process conversations in order, keeping the last occurrence of each phoneNumber+instanceNumber combination
  conversations.forEach((conversation) => {
    // Ensure we have valid data before processing
    if (conversation && typeof conversation === 'object' && conversation.phoneNumber && conversation.instanceNumber) {
      const key = `${conversation.phoneNumber}+${conversation.instanceNumber}`;
      seen.set(key, conversation);
    }
  });

  return Array.from(seen.values());
};

// Helper function to deduplicate conversations by phoneNumber, keeping the last occurrence
export const deduplicateInstanceConversations = (conversations: ChatContact[]): ChatContact[] => {
  const seen = new Map<string, ChatContact>();

  // Process conversations in order, keeping the last occurrence of each phoneNumber
  conversations.forEach((conversation) => {
    // Ensure we have valid data before processing
    if (conversation && typeof conversation === 'object' && conversation.phoneNumber) {
      seen.set(conversation.phoneNumber, conversation);
    }
  });

  return Array.from(seen.values());
};

// Helper function to find and update existing message or replace optimistic message
export const findAndUpdateMessage = (
  existingMessages: ChatMessage[],
  newMessage: ChatMessage
): { action: MessageHandlerActionEnum; index?: number } => {
  if (!newMessage.messageId) {
    return { action: MessageHandlerActionEnum.ADD };
  }

  const existingIndex = existingMessages.findIndex((msg) => msg.messageId === newMessage.messageId);

  if (existingIndex !== -1) {
    return { action: MessageHandlerActionEnum.UPDATE, index: existingIndex };
  }

  // Try to replace optimistic message
  const optimisticIndex = existingMessages.findIndex(
    (msg) =>
      msg.isOptimistic &&
      msg.fromNumber === newMessage.fromNumber &&
      msg.toNumber === newMessage.toNumber &&
      msg.text === newMessage.text &&
      Math.abs(new Date(msg.createdAt).getTime() - new Date(newMessage.createdAt).getTime()) < 30000
  );

  if (optimisticIndex !== -1) {
    return { action: MessageHandlerActionEnum.REPLACE, index: optimisticIndex };
  }

  return { action: MessageHandlerActionEnum.ADD };
};

// Helper function to update conversation in list (moves to top)
export const updateConversationInList = <T extends { phoneNumber: string; lastMessage: string; lastMessageAt: string }>(
  conversations: T[],
  newMessage: ChatMessage,
  isGlobalChat: boolean = false
): T[] => {
  if (!newMessage.createdAt || !newMessage.text || !newMessage.text.trim()) {
    return conversations;
  }

  const conversationIndex = conversations.findIndex((conv) => {
    if (isGlobalChat) {
      const globalConv = conv as unknown as GlobalChatContact;
      return (
        (globalConv.instanceNumber === newMessage.fromNumber && globalConv.phoneNumber === newMessage.toNumber) ||
        (globalConv.instanceNumber === newMessage.toNumber && globalConv.phoneNumber === newMessage.fromNumber)
      );
    } else {
      return conv.phoneNumber === newMessage.fromNumber || conv.phoneNumber === newMessage.toNumber;
    }
  });

  if (conversationIndex === -1) {
    return conversations;
  }

  // Update the conversation with new message data
  const updatedConversation = {
    ...conversations[conversationIndex],
    lastMessage: newMessage.text!,
    lastMessageAt: newMessage.createdAt,
  };

  // Remove the conversation from its current position and add it to the top
  const remainingConversations = conversations.filter((_, index) => index !== conversationIndex);
  return [updatedConversation, ...remainingConversations];
};

// Helper function to add or update conversation in list
export const addOrUpdateConversation = <T extends { phoneNumber: string }>(
  conversations: T[],
  newConversation: T,
  isGlobalChat: boolean = false
): T[] => {
  const conversationIndex = conversations.findIndex((conv) => {
    if (isGlobalChat) {
      const globalConv = conv as unknown as GlobalChatContact;
      const newGlobalConv = newConversation as unknown as GlobalChatContact;
      return (
        (globalConv.instanceNumber === newGlobalConv.instanceNumber && globalConv.phoneNumber === newGlobalConv.phoneNumber) ||
        (globalConv.instanceNumber === newGlobalConv.phoneNumber && globalConv.phoneNumber === newGlobalConv.instanceNumber)
      );
    } else {
      return conv.phoneNumber === newConversation.phoneNumber;
    }
  });

  if (conversationIndex !== -1) {
    // Update existing conversation and move to top
    const existingConversation = conversations[conversationIndex];
    const updatedConversation = {
      ...existingConversation,
      ...newConversation,
      // Preserve existing name if new conversation doesn't have one (for global chat)
      ...(isGlobalChat && 'name' in newConversation && !newConversation.name && 'name' in existingConversation
        ? { name: (existingConversation as Record<string, unknown>).name }
        : {}),
    };

    // Remove the conversation from its current position and add it to the top
    const remainingConversations = conversations.filter((_, index) => index !== conversationIndex);
    return [updatedConversation, ...remainingConversations];
  } else {
    // Add new conversation to the top of the list
    return [newConversation, ...conversations];
  }
};
