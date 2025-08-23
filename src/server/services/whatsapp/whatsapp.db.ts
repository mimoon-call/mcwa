import type { WAAppAuth, WAAppKey, WAMessage, WAMessageIncomingRaw, WAMessageOutgoingRaw } from './whatsapp-instance.type';
import type { WAPersona } from './whatsapp.type';
import { Schema } from 'mongoose';
import getLocalTime from '../../helpers/get-local-time';
import { MongoService } from '../database/mongo.service';

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
    statusCode: { type: Number, required: false },
    errorMessage: { type: String, required: false },
    blockedCount: { type: Number, required: true, default: 0 }, // Lifetime total - never reset
    outgoingMessageCount: { type: Number, required: true, default: 0 }, // Lifetime total - never reset
    incomingMessageCount: { type: Number, required: true, default: 0 }, // Lifetime total - never reset
    dailyMessageCount: { type: Number, required: true, default: 0 }, // Daily count for warm-up - resets daily
    maxDailyMessages: { type: Number, required: false, default: 200 },
    lastSentMessage: { type: String, required: false }, // Date of last sent message (YYYY-MM-DD)
    hasPrivacyUpdated: { type: Boolean },
    profilePictureUrl: { type: String },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    // warm
    warmUpDay: { type: Number, required: true, default: 0 },
    hasWarmedUp: { type: Boolean, required: true, default: false },
    dailyWarmUpCount: { type: Number, required: true, default: 0 }, // Count of warm-up days completed
    dailyWarmConversationCount: { type: Number, required: true, default: 0 },
    totalWarmUpCount: { type: Number, required: true, default: 0 },
    lastWarmedUpDay: { type: String, required: false }, // Date of last warm-up day (YYYY-MM-DD)
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

export const WhatsAppMessage = new MongoService<WAMessage & { raw: WAMessageIncomingRaw | WAMessageOutgoingRaw; createdAt: Date }>(
  'WhatsAppMessage',
  {
    fromNumber: { type: String, required: true },
    toNumber: { type: String, required: true },
    text: { type: String },
    internalFlag: { type: Boolean },
    warmingFlag: { type: Boolean },
    raw: { type: Schema.Types.Mixed },
    info: { type: Schema.Types.Mixed },
    createdAt: { type: Date },
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
