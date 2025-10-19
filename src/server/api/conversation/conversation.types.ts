import type { WAAppAuth, WAMessage } from '@server/services/whatsapp/whatsapp-instance.type';
import type { Pagination, EntityList } from '@models';
import { InterestResult } from '@server/api/message-queue/reply/interest.classifier';
import { MessageQueueItem } from '@server/api/message-queue/message-queue.types';

export type SearchConversationItem = { phoneNumber: string; name: string | null; lastMessage: string; lastMessageAt: string; messageCount: number };

export type SearchConversationReq = {
  searchValue?: string;
  externalFlag?: boolean;
  page: Pagination;
};

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
  webhookErrorMessage?: MessageQueueItem['webhookErrorMessage'];
  webhookSuccessFlag?: MessageQueueItem['webhookSuccessFlag'];
  action?: InterestResult['action'];
  confidence?: InterestResult['confidence'];
  department?: InterestResult['department'];
  interested?: InterestResult['interested'];
  reason?: InterestResult['reason'];
  intent?: InterestResult['intent'];
  followUpAt?: InterestResult['followUpAt'];
  hasStartMessage: boolean;
};

export type SearchAllConversationsReq = {
  page: Pagination;
  searchValue?: string;
  intents?: string[];
  departments?: string[];
  interested?: boolean | null;
};

export type SearchAllConversationsRes = EntityList<ConversationPairItem>;

export type SendMessageReq = { textMessage: string };

export type DeleteConversationReq = { fromNumber: string; toNumber: string };

export type DeleteConversationRes = { returnCode: number; deletedMessagesCount: number; deletedQueueCount: number };
