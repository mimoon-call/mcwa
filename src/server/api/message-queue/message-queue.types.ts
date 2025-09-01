import type { EntityList, Pagination } from '@models';

export type MessageQueueItem = {
  phoneNumber: string;
  fullName: string;
  textMessage: string;
  sentAt?: Date;
  failedAt?: Date;
  instanceNumber?: string;
};

export type SearchMessageQueueRes = EntityList<MessageQueueItem, { isSending: boolean }>;
export type SearchMessageQueueReq = Partial<{ page: Pagination; hasBeenSent?: boolean }>;

export type AddMessageQueueReq = { data: Array<Pick<MessageQueueItem, 'phoneNumber' | 'fullName'>>; textMessage: string };
