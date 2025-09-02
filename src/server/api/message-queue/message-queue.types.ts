import type { EntityList, Pagination } from '@models';
import { ObjectId } from 'mongodb';

export type MessageQueueItem = {
  _id: ObjectId;
  phoneNumber: string;
  fullName: string;
  textMessage: string;
  sentAt?: Date;
  lastError?: string;
  instanceNumber?: string;
};

export type SearchMessageQueueRes = EntityList<MessageQueueItem>;
export type SearchMessageQueueReq = Partial<{ page: Pagination; hasBeenSent?: boolean }>;
export type AddMessageQueueReq = { data: Pick<MessageQueueItem, 'phoneNumber' | 'fullName'>[]; textMessage: string };

export type MessageQueueActiveEvent = Partial<{ messageCount: number; messagePass: number; isSending: boolean }>;
export type MessageQueueSendEvent = MessageQueueItem & { error?: string };
