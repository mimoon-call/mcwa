import type { EntityList, Pagination } from '@models';

export type InstanceItem = {
  phoneNumber: string;
  isActive: boolean;
  dailyMessageCount: number;
  outgoingMessageCount: number;
  incomingMessageCount: number;
  statusCode: number;
  errorMessage: string;
  warmUpDay: number;
  dailyWarmUpCount: number;
  dailyWarmConversationCount: number;
  hasWarmedUp: boolean;
  createdAt: string;
};

export type SearchInstanceRes = EntityList<InstanceItem>;
export type SearchInstanceReq = Partial<{ page: Pagination }>;

export type AddInstanceRes = { image: string };

export type InstanceUpdate = Pick<InstanceItem, 'phoneNumber'> & Partial<Omit<InstanceItem, 'phoneNumber'>>;
export type WarmUpdate = { phoneNumber1: string; phoneNumber2: string; totalMessages: number; sentMessages: number; unsentMessages: number };
