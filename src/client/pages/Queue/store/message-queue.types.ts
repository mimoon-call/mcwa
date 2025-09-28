import type { EntityList, Pagination } from '@models';

export type InterestResult = {
  interested: boolean;
  intent: string;
  reason: string;
  confidence: number; // 0..1
  suggestedReply: string;
  action?: string;
  followUpAt?: string; // ISO date-time with numeric offset
  department: string;
};

export type MessageQueueItem = {
  _id: string;
  phoneNumber: string;
  textMessage: string;
  tts?: boolean;
  sentAt?: Date;
  instanceNumber?: string;
  attempt?: number;
  lastError?: string;
  maxAttempts?: number;
};

export type SearchMessageQueueRes = EntityList<MessageQueueItem>;
export type SearchMessageQueueReq = Partial<{ page: Pagination }>;

export type AddMessageQueueReq = {
  data: Pick<MessageQueueItem, 'phoneNumber'>[];
  textMessage: MessageQueueItem['textMessage'];
  tts?: MessageQueueItem['tts'];
};

export type AddMessageQueueRes = { addedCount: number; blockedCount: number };

export type EditMessageQueueReq = Pick<MessageQueueItem, '_id' | 'phoneNumber' | 'textMessage'>;

export type MessageQueueActiveEvent = { messageCount: number; messagePass: number; isSending: boolean };
export type MessageQueueSendEvent = MessageQueueItem & { error?: string };
export type NewOpportunityEvent = { phoneNumber: string; instanceNumber: string; text: string } & InterestResult;
