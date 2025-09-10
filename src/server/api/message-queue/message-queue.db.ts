import type { MessageQueueItem } from '@server/api/message-queue/message-queue.types';
import { MongoService } from '@server/services/database/mongo.service';

export const MessageQueueDb = new MongoService<MessageQueueItem>(
  'WhatsappQueue',
  {
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    textMessage: { type: String, required: true },
    tts: { type: Boolean, default: false },
    messageId: { type: String },
    instanceNumber: { type: String },
    lastError: { type: String },
    attempt: { type: Number, default: 0 },
    sentAt: { type: Date },
    createdAt: { type: Date, required: true },
  },
  { timestamps: false },
  {
    indexes: [
      { fields: { phoneNumber: 1 }, options: { name: 'phoneNumber_index' } },
      { fields: { textMessage: 1 }, options: { name: 'textMessage_index' } },
      { fields: { instanceNumber: 1 }, options: { name: 'instanceNumber_index' } },
      { fields: { attempt: 1 }, options: { name: 'attempt_index' } },
    ],
  }
);
