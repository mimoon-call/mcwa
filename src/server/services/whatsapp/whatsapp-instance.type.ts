import { WhatsappInstance } from './whatsapp-instance.service';
import { proto } from '@whiskeysockets/baileys';

import IMessageKey = proto.IMessageKey;
import IMessage = proto.IMessage;
import IWebMessageInfo = proto.IWebMessageInfo;
import WebMessageInfo = proto.WebMessageInfo;
import { AuthenticationCreds } from '@whiskeysockets/baileys/lib/Types/Auth';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';

export type WAProxyConfig = {
  type?: 'HTTP' | 'SOCKS5'; // default HTTP
  host: string;
  port: number;
  username?: string;
  password?: string;
  stickyMinutes?: number;
  provider?: string;
};

export type WAAppAuth<T extends object> = T & {
  phoneNumber: string;
  creds: any;
  statusCode?: number;
  errorMessage?: string;
  lastErrorAt?: Date | null;
  isActive?: boolean;
  blockedCount: number;
  outgoingMessageCount: number; // Lifetime total - never reset
  incomingMessageCount: number; // Lifetime total - never reset
  dailyMessageCount: number; // Daily count for warm-up - resets daily
  outgoingErrorCount: number;
  outgoingReadCount: number;
  outgoingPlayCount: number;
  lastSentMessage: string; // Date of last sent message (YYYY-MM-DD)
  hasPrivacyUpdated?: boolean;
  profilePictureUrl?: string;
  lastIpAddress?: string;
  // warm up
  warmUpDay: number;
  maxDailyMessages: number;
  hasWarmedUp: boolean;
  dailyWarmUpCount: number;
  dailyWarmConversationCount: number;
  totalWarmUpCount: number;
  lastWarmedUpDay: string; // Date of last warm-up day (YYYY-MM-DD)
  // proxy
  proxy?: WAProxyConfig;
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
  // Check whatsapp number status before sending
  onWhatsapp?: boolean; // default true
  // Delivery tracking options
  trackDelivery?: boolean;
  // Timeout for delivery tracking (when messages are marked as ERROR)
  deliveryTrackingTimeout?: number; // milliseconds, default 30000
  // Wait for delivery confirmation
  waitForDelivery?: boolean; // Wait for DELIVERED status before resolving
  waitForRead?: boolean; // Wait for READ status before resolving (implies waitForDelivery)
  // Timeout for waiting for delivery confirmation
  waitTimeout?: number; // milliseconds, default 30000
  // Error handling
  throwOnDeliveryError?: boolean; // Throw error if delivery fails (default: false)
  // Message update callbacks (run regardless of waitForDelivery/waitForRead)
  onUpdate?: (messageId: string, deliveryStatus: WAMessageDelivery) => void;
};

export type WAMessage = {
  fromNumber: string;
  toNumber: string;
  text: string;
  fromJid?: string;
  toJid?: string;
  internalFlag?: boolean;
  warmingFlag?: boolean;
};

export type WAUnsubscribe = {
  phoneNumber: string;
  text: string;
  intent: keyof typeof LeadIntentEnum;
  reason: string;
  confidence: number;
  updatedAt: Date;
  createdAt: Date;
};

export type WAMessageIncoming = WAMessage;
export type WAMessageOutgoing = WAMessage;
export type MediaType = 'image' | 'video' | 'audio' | 'ptt' | 'document' | 'sticker' | 'none';

export type WAMessageIncomingRaw = IWebMessageInfo & {
  buffer?: Buffer;
  mediaType?: MediaType;
  mimeType?: string;
  fileName?: string;
  seconds?: number; // duration for audio/video when available
};

export type WAMessageOutgoingRaw = WebMessageInfo;

export type WAMessageIncomingCallback = (message: WAMessageIncoming, raw: WAMessageIncomingRaw, messageId: string) => Promise<unknown> | unknown;

export type WAMessageOutgoingCallback = (
  message: WAMessageOutgoing,
  raw?: WAMessageOutgoingRaw,
  deliveryStatus?: WAMessageDelivery
) => Promise<unknown> | unknown;
export type WASendingMessageCallback<T extends object> = (instance: WhatsappInstance<T>, toNumber: string) => Promise<unknown> | unknown;
export type WAMessageBlockCallback = (fromNumber: string, toNumber: string, reason: string) => Promise<unknown> | unknown;
export type WAMessageUpdateCallback = (messageId: string, deliveryStatus: WAMessageDelivery) => Promise<unknown> | unknown;
export type WAOnReadyCallback<T extends object> = (instance: WhatsappInstance<T>) => Promise<unknown> | unknown;

export type WAOutgoingContent =
  | string
  | { type: 'text'; text: string }
  | { type: 'image'; data: Buffer; caption?: string; mimetype?: string }
  | { type: 'video'; data: Buffer; caption?: string; mimetype?: string }
  | { type: 'audio'; data: Buffer; caption?: string; mimetype?: string; ptt?: boolean; seconds?: number; duration?: number; text?: string }
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
  debugMode: true | 'error' | 'warn' | 'info' | 'debug' | ('error' | 'warn' | 'info' | 'debug')[];
  // Callbacks for message events
  onIncomingMessage: WAMessageIncomingCallback;
  onOutgoingMessage: WAMessageOutgoingCallback;
  onSendingMessage?: WASendingMessageCallback<T>;
  onMessageBlocked: WAMessageBlockCallback;
  onMessageUpdate: WAMessageUpdateCallback;
  // Callbacks for instance events
  onRegistered: (phoneNumber: string) => Promise<unknown> | unknown;
  onReady: WAOnReadyCallback<T>;
  onDisconnect: (phoneNumber: string, reason: string) => Promise<unknown> | unknown;
  onError: (phoneNumber: string, error: any) => Promise<unknown> | unknown;
  onRemove: (phoneNumber: string) => Promise<unknown> | unknown;
  onUpdate: (state: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown;
}>;

export type WAMessageDelivery = {
  messageId: string | null;
  status: keyof typeof MessageStatusEnum;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  playedAt?: Date;
  errorCode?: number;
  errorMessage?: string;
};

type MediaPart =
  | proto.Message.IVideoMessage
  | proto.Message.IAudioMessage
  | proto.Message.IImageMessage
  | proto.Message.IDocumentMessage
  | proto.Message.IStickerMessage;

export { IMessage, IMessageKey, IWebMessageInfo, AuthenticationCreds, WebMessageInfo, MediaPart };
