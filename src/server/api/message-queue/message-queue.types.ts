import type { EntityList, Pagination } from '@models';
import { ObjectId } from 'mongodb';

export type MessageQueueItem = {
  _id: ObjectId;
  phoneNumber: string;
  fullName: string;
  textMessage: string;
  tts?: boolean;
  attempt: number;
  instanceNumber?: string;
  messageId: string;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
};

export type SearchMessageQueueRes = EntityList<MessageQueueItem>;
export type SearchMessageQueueReq = Partial<{ page: Pagination; hasBeenSent?: boolean }>;
export type AddMessageQueueReq = { data: Pick<MessageQueueItem, 'phoneNumber' | 'fullName'>[]; textMessage: string };
export type EditMessageQueueReq = Pick<MessageQueueItem, '_id' | 'phoneNumber' | 'fullName' | 'textMessage'>;

export type MessageQueueActiveEvent = Partial<{ messageCount: number; messagePass: number; isSending: boolean }>;
export type MessageQueueSendEvent = MessageQueueItem & { error?: string };
