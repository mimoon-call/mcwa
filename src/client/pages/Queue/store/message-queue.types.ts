import type { EntityList, Pagination } from '@models';

export type MessageQueueItem = {
  _id: string;
  phoneNumber: string;
  textMessage: string;
  tts?: boolean;
  sentAt?: Date;
  instanceNumber?: string;
  attempt?: number;
  lastError?: string;
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
