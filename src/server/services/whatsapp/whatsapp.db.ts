import type { WAAppAuth, WAAppKey, WAUnsubscribe } from './whatsapp-instance.type';
import type { MessageDocument, WAPersona } from './whatsapp.type';
import { Schema } from 'mongoose';
import getLocalTime from '../../helpers/get-local-time';
import { MongoService } from '../database/mongo.service';
import { LeadActionEnum, LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';

// Pre-save middleware to set timezone-aware timestamps
const setModifiedAndCreationDate = function (doc: any) {
  const now = getLocalTime();

  if (doc.isNew) {
    doc.createdAt = now;
  }

  // Only set updatedAt if the field exists in the schema
  if (doc.schema.paths.updatedAt) {
    doc.updatedAt = now;
  }
};

export const WhatsAppAuth = new MongoService<WAAppAuth<WAPersona> & { createdAt: Date; updatedAt: Date }>(
  'WhatsAppAuth',
  {
    phoneNumber: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true },
    creds: { type: Schema.Types.Mixed, required: false },
    comment: { type: String },
    statusCode: { type: Number, required: false },
    errorMessage: { type: String, required: false },
    lastErrorAt: { type: Date },
    blockedCount: { type: Number, required: true, default: 0 }, // Lifetime total - never reset
    outgoingErrorCount: { type: Number, default: 0 }, // Lifetime total - never reset
    outgoingReadCount: { type: Number, default: 0 }, // Lifetime total - never reset
    outgoingPlayCount: { type: Number, default: 0 }, // Lifetime total - never reset
    outgoingMessageCount: { type: Number, required: true, default: 0 }, // Lifetime total - never reset
    incomingMessageCount: { type: Number, required: true, default: 0 }, // Lifetime total - never reset
    dailyMessageCount: { type: Number, required: true, default: 0 }, // Daily count for warm-up - resets daily
    maxDailyMessages: { type: Number, required: false, default: 200 },
    lastSentMessage: { type: String, required: false }, // Date of last sent message (YYYY-MM-DD)
    hasPrivacyUpdated: { type: Boolean },
    profilePictureUrl: { type: String },
    lastIpAddress: { type: String },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    // warm
    warmUpDay: { type: Number, required: true, default: 0 },
    hasWarmedUp: { type: Boolean, required: true, default: false },
    dailyWarmUpCount: { type: Number, required: true, default: 0 }, // Count of warm-up days completed
    dailyWarmConversationCount: { type: Number, required: true, default: 0 },
    totalWarmUpCount: { type: Number, required: true, default: 0 },
    lastWarmedUpDay: { type: String, required: false }, // Date of last warm-up day (YYYY-MM-DD)
    // proxy
    proxy: {
      type: { type: String, enum: ['HTTP', 'SOCKS5'], default: 'HTTP' },
      host: { type: String },
      port: { type: Number },
      username: { type: String },
      password: { type: String },
      stickyMinutes: { type: Number },
      provider: { type: String },
    },
    // persona
    name: { type: String, required: true },
    language: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    jobTitle: { type: String, required: true },
    hobbies: { type: [String], required: true },
    interests: { type: [String], required: true },
    personality: { type: String, required: true },
    location: { type: String, required: false },
    maritalStatus: { type: String, required: false },
    children: { type: [{ name: String, age: Number }], required: false },
  },
  { timestamps: false },
  {
    indexes: [
      { fields: { phoneNumber: 1 }, options: { unique: true, name: 'phoneNumber_unique' } },
      { fields: { isActive: 1 }, options: { name: 'isActive_index' } },
      { fields: { hasWarmedUp: 1 }, options: { name: 'hasWarmedUp_index' } },
      { fields: { createdAt: 1 }, options: { name: 'createdAt_index' } },
    ],
    preSave: setModifiedAndCreationDate,
  }
);

export const WhatsAppMessage = new MongoService<MessageDocument>(
  'WhatsAppMessage',
  {
    fromNumber: { type: String, required: true },
    toNumber: { type: String, required: true },
    text: { type: String },
    internalFlag: { type: Boolean },
    warmingFlag: { type: Boolean },
    raw: { type: Schema.Types.Mixed },
    createdAt: { type: Date },
    // Delivery status tracking
    status: { type: String, enum: Object.values(MessageStatusEnum) },
    deletedAt: { type: Date },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    playedAt: { type: Date },
    errorCode: { type: Number },
    errorMessage: { type: String },
    messageId: { type: String }, // ID from WhatsApp system
    // Interest classification
    interested: { type: Boolean },
    intent: { type: String, enum: Object.values(LeadIntentEnum) },
    reason: { type: String },
    confidence: { type: Number }, // 0..1
    suggestedReply: { type: String },
    action: { type: String, enum: Object.values(LeadActionEnum) },
    department: { type: String, enum: Object.values(LeadDepartmentEnum) },
    followUpAt: { type: String },
  },
  { timestamps: false },
  {
    indexes: [
      { fields: { fromNumber: 1 }, options: { name: 'fromNumber_index' } },
      { fields: { toNumber: 1 }, options: { name: 'toNumber_index' } },
      { fields: { fromNumber: 1, toNumber: 1 }, options: { name: 'fromNumber_toNumber_compound' } },
      { fields: { createdAt: 1 }, options: { name: 'createdAt_index' } },
      { fields: { internalFlag: 1 }, options: { name: 'internalFlag_index' } },
      { fields: { warmingFlag: 1 }, options: { name: 'warmingFlag_index' } },
      // Delivery status indexes
      { fields: { status: 1 }, options: { name: 'deliveryStatus_status_index' } },
      { fields: { sentAt: 1 }, options: { name: 'deliveryStatus_sentAt_index' } },
      { fields: { deletedAt: 1 }, options: { name: 'deliveryStatus_deletedAt_index' } },
      { fields: { deliveredAt: 1 }, options: { name: 'deliveryStatus_deliveredAt_index' } },
      { fields: { readAt: 1 }, options: { name: 'deliveryStatus_readAt_index' } },
      { fields: { playedAt: 1 }, options: { name: 'deliveryStatus_playedAt_index' } },
      { fields: { messageId: 1 }, options: { unique: true, sparse: true, name: 'messageId_unique' } },
      // Compound indexes for common query patterns
      { fields: { status: 1, deliveredAt: 1 }, options: { name: 'deliveryStatus_status_deliveredAt_compound' } },
      { fields: { status: 1, readAt: 1 }, options: { name: 'deliveryStatus_status_readAt_compound' } },
      // Critical indexes for conversation search aggregation
      { fields: { internalFlag: 1, text: 1, createdAt: -1 }, options: { name: 'conversation_search_compound' } },
      { fields: { fromNumber: 1, createdAt: -1 }, options: { name: 'fromNumber_createdAt_compound' } },
      { fields: { toNumber: 1, createdAt: -1 }, options: { name: 'toNumber_createdAt_compound' } },
      { fields: { fromNumber: 1, toNumber: 1, messageId: 1 }, options: { name: 'message_lookup_compound' } },
      { fields: { intent: 1 }, options: { name: 'intent_index' } },
      { fields: { department: 1 }, options: { name: 'department_index' } },
      { fields: { interested: 1 }, options: { name: 'interested_index' } },
    ],
    preSave: setModifiedAndCreationDate,
  }
);

export const WhatsAppUnsubscribe = new MongoService<WAUnsubscribe>(
  'WhatsAppUnsubscribe',
  {
    phoneNumber: { type: String, required: true },
    text: { type: String },
    intent: { type: String, enum: Object.values(LeadIntentEnum) },
    reason: { type: String },
    confidence: { type: Number }, // 0..1
    updatedAt: { type: Date },
    createdAt: { type: Date },
  },
  { timestamps: false },
  {
    indexes: [
      { fields: { phoneNumber: 1 }, options: { unique: true, name: 'phoneNumber_unique' } },
      { fields: { createdAt: 1 }, options: { name: 'createdAt_index' } },
    ],
    preSave: setModifiedAndCreationDate,
  }
);

export const WhatsAppKey = new MongoService<WAAppKey & { createdAt: Date; updatedAt: Date }>(
  'WhatsAppKey',
  {
    phoneNumber: { type: String, required: true },
    keyType: { type: String, required: true },
    keyId: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: false },
  {
    indexes: [
      { fields: { phoneNumber: 1 }, options: { name: 'phoneNumber_index' } },
      { fields: { keyType: 1 }, options: { name: 'keyType_index' } },
      { fields: { keyId: 1 }, options: { name: 'keyId_index' } },
      { fields: { phoneNumber: 1, keyType: 1, keyId: 1 }, options: { name: 'phoneNumber_keyType_keyId_compound' } },
      { fields: { createdAt: 1 }, options: { name: 'createdAt_index' } },
    ],
    preSave: setModifiedAndCreationDate,
  }
);
