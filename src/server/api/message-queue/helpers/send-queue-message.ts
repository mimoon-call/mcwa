import replaceStringVariable from '@server/helpers/replace-string-variable';
import { app, wa } from '@server/index';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import { MessageQueueItem, MessageQueueSendEvent } from '@server/api/message-queue/message-queue.types';
import getLocalTime from '@server/helpers/get-local-time';

export const sendQueueMessage = async (doc: MessageQueueItem, maxAttempts: number = 3) => {
  let attempts = 0;
  let success = false;

  while (attempts < maxAttempts && !success) {
    try {
      attempts++;
      const textMessage = replaceStringVariable(doc.textMessage, doc);
      const { instanceNumber } = await wa.sendMessage(null, doc.phoneNumber, textMessage, { deliveryTrackingTimeout: 30000, waitForDelivery: true });
      await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), instanceNumber } });
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
      success = true;
      await new Promise((resolve) => setTimeout(resolve, 20000)); // wait 20 seconds between messages
    } catch (e) {
      if (attempts === maxAttempts) {
        // Final attempt failed, mark as failed
        await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), lastError: String(e) } });
        app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, { ...doc, error: String(e) });
      } else {
        // Wait before retry (exponential backoff: 3s, 6s, 9s)
        const retryDelay = attempts * 3000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
};
