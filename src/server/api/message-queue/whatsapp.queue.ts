import type { MessageQueueItem } from '@server/api/message-queue/message-queue.types';
import { MongoService } from '@server/services/database/mongo.service';
import { LeadActionEnum, LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';
import { InterestResult } from '@client/pages/Queue/store/message-queue.types';

export const WhatsappQueue = new MongoService<MessageQueueItem & Partial<InterestResult>>(
  'WhatsappQueue',
  {
    phoneNumber: { type: String, required: true },
    fullName: { type: String },
    textMessage: { type: String, required: true },
    tts: { type: Boolean, default: false },
    messageId: { type: String },
    instanceNumber: { type: String },
    lastError: { type: String },
    attempt: { type: Number, default: 0 },
    sentAt: { type: Date },
    createdAt: { type: Date, required: true },
    initiatorMessageId: { type: String, default: null },
    metaTemplateId: { type: String, default: null },
    webhookErrorMessage: { type: String, default: null },
    webhookSuccessFlag: { type: Boolean, default: null },
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
      { fields: { phoneNumber: 1 }, options: { name: 'phoneNumber_index' } },
      { fields: { textMessage: 1 }, options: { name: 'textMessage_index' } },
      { fields: { instanceNumber: 1 }, options: { name: 'instanceNumber_index' } },
      { fields: { attempt: 1 }, options: { name: 'attempt_index' } },
      { fields: { createdAt: 1 }, options: { name: 'createdAt_index' } },
      { fields: { messageId: 1 }, options: { name: 'messageId_index' } },
      // Compound indexes for conversation lookup optimization
      { fields: { phoneNumber: 1, instanceNumber: 1, createdAt: -1 }, options: { name: 'conversation_lookup_compound' } },
      { fields: { phoneNumber: 1, instanceNumber: 1, messageId: 1 }, options: { name: 'message_reference_compound' } },
    ],
  }
);
