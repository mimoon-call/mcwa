// src/client/pages/Chat/store/chat.types.ts
import type { EntityList } from '@models/entity-list';
import type { Pagination } from '@models/pagination';

export type ChatContact = {
  phoneNumber: string;
  name: string | null;
  lastMessage: string;
  lastMessageAt: string;
  profilePictureUrl: string | null;
};

export type ChatMessage = {
  fromNumber: string;
  toNumber: string;
  text: string;
  createdAt: string;
};

export type SearchConversationsReq = {
  phoneNumber: string;
  page?: Pagination;
  searchValue?: string;
};

export type InstanceChat = { isConnected: boolean; statusCode: number | null; errorMessage: string | null; profilePictureUrl: string | null };
export type SearchConversationsRes = EntityList<ChatContact, InstanceChat>;

export type GetConversationReq = {
  phoneNumber: string;
  withPhoneNumber: string;
  page?: Pagination;
};

export type GetConversationRes = EntityList<ChatMessage>;
