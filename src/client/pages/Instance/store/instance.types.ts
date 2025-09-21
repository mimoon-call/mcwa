import type { EntityList, Pagination } from '@models';

export type InstanceItem = {
  phoneNumber: string;
  isActive: boolean;
  profilePictureUrl?: string;
  dailyMessageCount: number;
  outgoingErrorCount: number;
  outgoingMessageCount: number;
  incomingMessageCount: number;
  statusCode: number;
  errorMessage: string;
  warmUpDay: number;
  dailyWarmUpCount: number;
  dailyWarmConversationCount: number;
  hasWarmedUp: boolean;
  createdAt: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  lastIpAddress?: string | null;
  isWarmingUp: boolean;
  isConnected: boolean;
  lastErrorAt: string;
  comment?: string;
};

export type SearchInstanceRes = EntityList<InstanceItem>;
export type SearchInstanceReq = Partial<{ isActive: boolean; hasWarmedUp: boolean; phoneNumber: string; statusCode: number; page: Pagination }>;

export type AddInstanceRes = { image: string };

export type InstanceUpdate = Pick<InstanceItem, 'phoneNumber'> & Partial<Omit<InstanceItem, 'phoneNumber'>>;
export type WarmUpdate = { phoneNumber1: string; phoneNumber2: string; totalMessages: number; sentMessages: number; unsentMessages: number };
export type WarmActive = Pick<WarmUpdate, 'phoneNumber1' | 'phoneNumber2'>;
