import type { WAMessageDelivery } from '@server/services/whatsapp/whatsapp-instance.type';
import type { MessageQueueItem, MessageQueueSendEvent } from '@server/api/message-queue/message-queue.types';
import replaceStringVariable from '@server/helpers/replace-string-variable';
import { app, wa } from '@server/index';
import { WhatsappQueue } from '@server/api/message-queue/whatsapp.queue';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import getLocalTime from '@server/helpers/get-local-time';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { AudioService } from '@server/services/ffmpeg/ffmpeg.service';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { LRUCache } from 'lru-cache';

const SENT_STATUSES = [MessageStatusEnum.DELIVERED, MessageStatusEnum.READ, MessageStatusEnum.PLAYED];
const deliveryCache = new LRUCache<string, WAMessageDelivery>({ max: 500, ttl: 1000 * 60 * 60 * 12 }); // Cache for 12 hours

export const sendQueueMessage = async (doc: MessageQueueItem, successCallback?: () => Promise<unknown> | unknown) => {
  const onUpdate = async (messageId: string, deliveryStatus: WAMessageDelivery) => {
    const currentDelivery = deliveryCache.get(messageId);

    if (currentDelivery && currentDelivery.status === deliveryStatus.status) return;
    deliveryCache.set(messageId, deliveryStatus);

    if (SENT_STATUSES.includes(deliveryStatus.status as MessageStatusEnum)) {
      await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), messageId } });
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
      successCallback?.();
    } else if (deliveryStatus.status === MessageStatusEnum.ERROR && messageId) {
      // Clean up the WhatsAppMessage record
      await WhatsAppMessage.deleteOne({ messageId });

      // Update queue with error details and increment attempt
      await WhatsappQueue.updateOne(
        { _id: doc._id },
        { $set: { lastError: deliveryStatus.errorMessage }, $unset: { sentAt: 1 }, $inc: { attempt: 1 } }
      );

      // Broadcast failure event
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, {
        ...doc,
        attempt: (doc.attempt || 0) + 1,
        error: deliveryStatus.errorMessage,
      });
    }
  };

  let messageResult: { key?: { id?: string | null }; messageId?: string | null; instanceNumber?: string } | null = null;

  try {
    const textMessage = replaceStringVariable(doc.textMessage, doc);

    messageResult = await (async () => {
      if (doc.tts) {
        const openAi = new OpenAiService();
        const audioSvc = new AudioService();
        const ttsBuf = await openAi.textToSpeech(textMessage, 'ogg');
        if (!ttsBuf) throw new Error('TTS failed: empty buffer');

        const ogg = await audioSvc.ensureOpusOgg(ttsBuf);
        const seconds = await audioSvc.getDurationSeconds(ogg, 'audio/ogg');

        return await wa.sendMessage(
          null,
          doc.phoneNumber,
          { type: 'audio', data: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true, duration: seconds, text: textMessage },
          {
            onUpdate,
            trackDelivery: true, // Enable delivery tracking
            waitForDelivery: true, // Wait for delivery confirmation
            waitTimeout: 60000, // 1 minute timeout
            throwOnDeliveryError: true, // Throw to see the actual error
            maxRetries: 1, // Single attempt per message
          }
        );
      }

      return await wa.sendMessage(null, doc.phoneNumber, textMessage, {
        onUpdate,
        trackDelivery: true, // Enable delivery tracking
        waitForDelivery: true, // Wait for delivery confirmation
        waitTimeout: 60000, // 1 minute timeout
        throwOnDeliveryError: true, // Throw to see the actual error
        maxRetries: 1, // Single attempt per message
      });
    })();

    // Check if message was sent successfully (even if delivery confirmation timed out)
    const messageSent = messageResult && messageResult.key && messageResult.key.id;

    if (messageSent) {
      const instanceNumber = messageResult.instanceNumber;
      const messageId = messageResult.key?.id || messageResult.messageId || null;
      const sentAt = getLocalTime();

      await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { sentAt, instanceNumber, messageId }, $unset: { lastError: 1 } });
    } else {
      throw new Error('Message was not sent successfully - no message ID returned');
    }
  } catch (e) {
    // Any failure is a failure - increment attempt count
    await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { lastError: String(e) }, $unset: { sentAt: 1 }, $inc: { attempt: 1 } });

    app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, {
      ...doc,
      attempt: (doc.attempt || 0) + 1,
      error: String(e),
    });
  }
};
