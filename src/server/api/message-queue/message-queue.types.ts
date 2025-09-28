import type { EntityList, Pagination } from '@models';
import type { BaseResponse } from '@server/models';
import { ObjectId } from 'mongodb';
import { InterestResult } from '@server/api/message-queue/reply/interest.classifier';

export type MessageQueueItem = {
  _id: ObjectId;
  phoneNumber: string;
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
export type AddMessageQueueReq = {
  data: (Pick<MessageQueueItem, 'phoneNumber'> & { columns?: Record<string, string> })[];
  textMessage: string;
  tts?: MessageQueueItem['tts'];
};
export type AddMessageQueueRes = BaseResponse<{ addedCount: number; blockedCount: number }>;
export type EditMessageQueueReq = Pick<MessageQueueItem, '_id' | 'phoneNumber' | 'textMessage' | 'tts'>;

export type MessageQueueActiveEvent = Partial<{ messageCount: number; messagePass: number; isSending: boolean }>;
export type MessageQueueSendEvent = MessageQueueItem & { error?: string; maxAttempts?: number };
export type NewOpportunityEvent = { phoneNumber: string; instanceNumber: string; text: string } & InterestResult;
