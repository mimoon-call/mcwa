import replaceStringVariable from '@server/helpers/replace-string-variable';
import { app, wa } from '@server/index';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import { MessageQueueItem, MessageQueueSendEvent } from '@server/api/message-queue/message-queue.types';
import getLocalTime from '@server/helpers/get-local-time';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { AudioService } from '@server/services/ffmpeg/ffmpeg.service';

export const sendQueueMessage = async (doc: MessageQueueItem, maxAttempts: number = 3, ptt: boolean = false) => {
  let attempts = 0;
  let success = false;

  while (attempts < maxAttempts && !success) {
    try {
      attempts++;
      const textMessage = replaceStringVariable(doc.textMessage, doc);

      const messageResult = await (async () => {
        if (ptt) {
          const openAi = new OpenAiService();
          const audioSvc = new AudioService();
          const ttsBuf = await openAi.textToSpeech(textMessage, 'ogg');
          if (!ttsBuf) throw new Error('TTS failed: empty buffer');

          const ogg = await audioSvc.ensureOpusOgg(ttsBuf);
          const seconds = await audioSvc.getDurationSeconds(ogg, 'audio/ogg');

          return await wa.sendMessage(
            null,
            doc.phoneNumber,
            { type: 'audio', data: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true, duration: seconds },
            { deliveryTrackingTimeout: 60000, waitForDelivery: true, throwOnDeliveryError: true }
          );
        }

        return await wa.sendMessage(null, doc.phoneNumber, textMessage, {
          deliveryTrackingTimeout: 30000,
          waitForDelivery: true,
          throwOnDeliveryError: false,
        });
      })();

      // Check if message was sent successfully (even if delivery confirmation timed out)
      const messageSent = messageResult && messageResult.key && messageResult.key.id;

      if (messageSent) {
        await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), instanceNumber: messageResult.key.id } });
        app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
        success = true;
      } else {
        throw new Error('Message was not sent successfully - no message ID returned');
      }

      await new Promise((resolve) => setTimeout(resolve, 5000)); // wait 5 seconds between messages
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
