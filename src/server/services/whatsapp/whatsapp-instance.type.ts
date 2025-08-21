import { WhatsappInstance } from './whatsapp-instance.service';
import { AnyMessageContent, proto } from '@whiskeysockets/baileys';

import IMessage = proto.IMessage;
import IWebMessageInfo = proto.IWebMessageInfo;
import WebMessageInfo = proto.WebMessageInfo;
import { AuthenticationCreds } from '@whiskeysockets/baileys/lib/Types/Auth';

export type WAAppAuth<T extends object> = T & {
  phoneNumber: string;
  creds: any;
  statusCode?: number;
  errorMessage?: string;
  isActive?: boolean;
  blockedCount: number;
  outgoingMessageCount: number; // Lifetime total - never reset
  incomingMessageCount: number; // Lifetime total - never reset
  dailyMessageCount: number; // Daily count for warm-up - resets daily
  lastSentMessage: string; // Date of last sent message (YYYY-MM-DD)
  hasPrivacyUpdated?: boolean;
  profilePictureUrl?: string;
  // warm up
  warmUpDay: number;
  maxDailyMessages: number;
  hasWarmedUp: boolean;
  dailyWarmUpCount: number;
  dailyWarmConversationCount: number;
  totalWarmUpCount: number;
  lastWarmedUpDay: string; // Date of last warm-up day (YYYY-MM-DD)
};

export type WAAppKey = {
  phoneNumber: string;
  keyType: string;
  keyId: string;
  data: any;
};

export type WASendOptions = {
  maxRetries?: number;
  retryDelay?: number;
  onSuccess?: (...arg: any[]) => void;
  onFailure?: (error: any, attempts: number) => void;
};

export type WAMessage = {
  fromNumber: string;
  toNumber: string;
  text: string;
  fromJid?: string;
  toJid?: string;
  internalFlag?: boolean;
  warmingFlag?: boolean;
  info?: WebMessageInfo;
};

export type WAMessageIncoming = WAMessage;
export type WAMessageOutgoing = WAMessage;

export type WAMessageIncomingRaw = IWebMessageInfo;
export type WAMessageOutgoingRaw = AnyMessageContent;

export type WAMessageIncomingCallback = (message: WAMessageIncoming, raw: WAMessageIncomingRaw) => Promise<unknown> | unknown;
export type WAMessageOutgoingCallback = (message: WAMessageOutgoing, raw: WAMessageOutgoingRaw, info?: WebMessageInfo) => Promise<unknown> | unknown;
export type WAMessageBlockCallback = (fromNumber: string, toNumber: string, reason: string) => Promise<unknown> | unknown;

export type WAOutgoingContent =
  | string
  | { type: 'text'; text: string }
  | { type: 'image'; data: Buffer; caption?: string; mimetype?: string }
  | { type: 'video'; data: Buffer; caption?: string; mimetype?: string }
  | { type: 'audio'; data: Buffer; caption?: string; mimetype?: string }
  | { type: 'document'; data: Buffer; fileName: string; mimetype?: string; caption?: string };

export type WAInstanceConfig<T extends object = Record<never, never>> = {
  // Callbacks for auth key management
  getAppAuth: (phoneNumber: string) => Promise<WAAppAuth<T> | null>;
  updateAppAuth: (phoneNumber: string, data: Partial<WAAppAuth<T>>) => Promise<WAAppAuth<T>>;
  updateAppKey: (phoneNumber: string, keyType: string, keyId: string, data: Partial<any>) => Promise<void>;
  deleteAppAuth: (phoneNumber: string) => Promise<void>;
  getAppKeys: (phoneNumber: string) => Promise<any[]>;
} & Partial<{
  tempDir: string;
  debugMode: true | 'error' | 'warn' | 'info' | 'debug' | Array<'error' | 'warn' | 'info' | 'debug'>;
  // Callbacks for message events
  onIncomingMessage: WAMessageIncomingCallback;
  onOutgoingMessage: WAMessageOutgoingCallback;
  onMessageBlocked: WAMessageBlockCallback;
  // Callbacks for instance events
  onRegistered: (phoneNumber: string) => Promise<unknown> | unknown;
  onReady: (instance: WhatsappInstance<T>) => Promise<unknown> | unknown;
  onDisconnect: (phoneNumber: string, reason: string) => Promise<unknown> | unknown;
  onError: (phoneNumber: string, error: any) => Promise<unknown> | unknown;
  onRemove: (phoneNumber: string) => Promise<unknown> | unknown;
  onUpdate: (state: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown;
}>;

export { IMessage, IWebMessageInfo, AuthenticationCreds, WebMessageInfo };
