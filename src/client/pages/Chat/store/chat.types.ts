// src/client/pages/Chat/store/chat.types.ts
import type { EntityList } from '@models/entity-list';
import type { Pagination } from '@models/pagination';

// Re-export enum for convenience
export { MessageStatusEnum } from './chat.enum';

export type GlobalChatContact = {
  name: string;
  phoneNumber: string;
  instanceNumber: string;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
  action: string;
  confidence: number;
  department: string;
  interested: boolean;
  reason: string;
  profilePictureUrl?: string | null;
};

export type ChatMessage = {
  fromNumber: string;
  toNumber: string;
  text: string | null;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  playedAt?: string;
  status?: string;
  messageId?: string;
  isOptimistic?: boolean; // Flag to identify optimistic messages
  tempId?: string; // Temporary ID for optimistic messages
  errorMessage?: string; // Error message for failed messages
};

export type SearchAllConversationsReq = {
  page?: Pagination;
  searchValue?: string;
};

export type SearchAllConversationsRes = EntityList<GlobalChatContact>;

export type GetConversationReq = {
  phoneNumber: string;
  withPhoneNumber: string;
  page?: Pagination;
};

export type GetConversationRes = EntityList<ChatMessage>;

export type SendMessageReq = { fromNumber: string; toNumber: string; textMessage: string };

export type DeleteConversationReq = { fromNumber: string; toNumber: string };

export type DeleteConversationRes = { returnCode: number; deletedMessagesCount: number; deletedQueueCount: number };

export type RemoveConversationReq = { fromNumber: string; toNumber: string };

export type ConversationPairItem = Omit<GlobalChatContact, 'instanceNumber'> & {
  instanceNumber: string | null;
  instanceConnected: boolean;
};
