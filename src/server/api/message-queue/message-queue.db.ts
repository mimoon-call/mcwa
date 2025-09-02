import { MongoService } from '@server/services/database/mongo.service';
import { MessageQueueItem } from '@server/api/message-queue/message-queue.types';

export const MessageQueueDb = new MongoService<MessageQueueItem>(
  'MessageQueue',
  {
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    textMessage: { type: String, required: true },
    createdAt: { type: Date, required: true },
    sentAt: { type: Date },
    lastError: { type: String },
    instanceNumber: { type: String },
  },
  { timestamps: false },
  {
    indexes: [
      { fields: { phoneNumber: 1 }, options: { name: 'phoneNumber_index' } },
      { fields: { textMessage: 1 }, options: { name: 'textMessage_index' } },
      { fields: { instanceNumber: 1 }, options: { name: 'instanceNumber_index' } },
      { fields: { lastError: 1 }, options: { name: 'lastError_index' } },
    ],
  }
);
