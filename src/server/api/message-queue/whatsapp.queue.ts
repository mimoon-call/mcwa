import type { MessageQueueItem } from '@server/api/message-queue/message-queue.types';
import { MongoService } from '@server/services/database/mongo.service';
import { LeadDepartmentEnum } from '@server/api/message-queue/reply/interest.enum';

export const WhatsappQueue = new MongoService<MessageQueueItem>(
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
    department: { type: String, enum: Object.values(LeadDepartmentEnum) },
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
