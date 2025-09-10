import type { WAAppAuth, WAMessage } from '@server/services/whatsapp/whatsapp-instance.type';
import type { Pagination, EntityList } from '@models';

export type SearchConversationItem = { phoneNumber: string; name: string | null; lastMessage: string; lastMessageAt: string; messageCount: number };

export type SearchConversationReq = { searchValue?: string; page: Pagination };

export type SearchConversationRes = EntityList<
  SearchConversationItem,
  { isConnected: boolean } & Pick<WAAppAuth<Record<never, never>>, 'statusCode' | 'errorMessage' | 'profilePictureUrl'>
>;

export type GetConversationItem = Pick<WAMessage, 'fromNumber' | 'toNumber' | 'text'> & {
  createdAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  playedAt?: Date;
  status?: string;
  messageId?: string;
};

export type GetConversationReq = { page: Pagination };

export type GetConversationRes = EntityList<GetConversationItem>;

export type ConversationPairItem = {
  name: string | null;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
  phoneNumber: string;
  instanceNumber: string | null;
  instanceConnected: boolean;
  action?: string;
  confidence?: number;
  department?: string;
  interested?: boolean;
  reason?: string;
};

export type GetAllConversationPairsReq = { page: Pagination; searchValue?: string };

export type GetAllConversationPairsRes = EntityList<ConversationPairItem>;

export type SendMessageReq = { textMessage: string };
