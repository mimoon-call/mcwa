// src/client/pages/Chat/store/chat.types.ts
import type { EntityList } from '@models/entity-list';
import type { Pagination } from '@models/pagination';

export enum MessageStatusEnum {
  RECEIVED = 'RECEIVED',
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  PLAYED = 'PLAYED',
  ERROR = 'ERROR',
}

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
