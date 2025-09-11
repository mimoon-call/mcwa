import type { Language } from './whatsapp.ai';
import { WAAppAuth, WAInstanceConfig, WAMessage, WAMessageDelivery, WAMessageIncomingRaw, WAMessageOutgoingRaw } from './whatsapp-instance.type';
import { InterestResult } from '@server/api/message-queue/reply/interest.classifier';

export type WAPersona = {
  phoneNumber: string;
  name: string;
  language: Language;
  age: number;
  gender: 'male' | 'female' | 'other';
  jobTitle: string;
  hobbies: string[];
  interests: string[];
  personality: string;
  location?: string;
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed';
  children: { name: string; age: number }[];
};

export type WAServiceConfig<T extends object> = Omit<WAInstanceConfig<T>, 'tempDir' | 'onReady' | 'onDisconnect' | 'onError' | 'onRemove'> & {
  listAppAuth: () => Promise<WAAppAuth<T>[]>;
};

export type WAConversation = { fromNumber: string; toNumber: string; text: string; sentAt?: Date };

export type WAReadyEvent = { activeList: string[]; readyCount: number; totalCount: number };

export type MessageDocument = WAMessage & {
  raw: WAMessageIncomingRaw | WAMessageOutgoingRaw;
  createdAt: Date;
} & Partial<InterestResult & WAMessageDelivery>;
