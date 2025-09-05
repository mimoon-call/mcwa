import type { EntityList, Pagination } from '@models';

export type MessageQueueItem = {
  _id: string;
  phoneNumber: string;
  fullName: string;
  textMessage: string;
  tts?: boolean;
  sentAt?: Date;
  lastError?: string;
  instanceNumber?: string;
};

export type SearchMessageQueueRes = EntityList<MessageQueueItem>;
export type SearchMessageQueueReq = Partial<{ page: Pagination }>;

export type AddMessageQueueReq = {
  data: Pick<MessageQueueItem, 'phoneNumber' | 'fullName'>[];
  textMessage: MessageQueueItem['textMessage'];
  tts?: MessageQueueItem['tts'];
};

export type EditMessageQueueReq = Pick<MessageQueueItem, '_id' | 'phoneNumber' | 'fullName' | 'textMessage'>;

export type MessageQueueActiveEvent = { messageCount: number; messagePass: number; isSending: boolean };
export type MessageQueueSendEvent = MessageQueueItem & { error?: string };
