import type { EntityList, Pagination } from '@models';

export type MessageQueueItem = {
  _id: string;
  phoneNumber: string;
  fullName: string;
  textMessage: string;
  sentAt?: Date;
  lastError?: string;
  instanceNumber?: string;
};

export type SearchMessageQueueRes = EntityList<MessageQueueItem, { isSending: boolean }>;
export type SearchMessageQueueReq = Partial<{ page: Pagination }>;

export type AddMessageQueueReq = { data: Array<Pick<MessageQueueItem, 'phoneNumber' | 'fullName'>>; textMessage: string };
