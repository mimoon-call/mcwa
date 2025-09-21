import type { MessageQueueItem, MessageQueueSendEvent } from '@server/api/message-queue/message-queue.types';
import { WAMessageDelivery, WAMessageOutgoingCallback } from '@server/services/whatsapp/whatsapp-instance.type';
import { app, wa } from '@server/index';
import { WhatsappQueue } from '@server/api/message-queue/whatsapp.queue';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import getLocalTime from '@server/helpers/get-local-time';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { AudioService } from '@server/services/ffmpeg/ffmpeg.service';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { LRUCache } from 'lru-cache';
import { MAX_SEND_ATTEMPT } from '@server/api/message-queue/message-queue.constants';

const SENT_STATUSES = [MessageStatusEnum.DELIVERED, MessageStatusEnum.READ, MessageStatusEnum.PLAYED];
const deliveryCache = new LRUCache<string, WAMessageDelivery>({ max: 500, ttl: 1000 * 60 * 60 * 12 }); // Cache for 12 hours

export const sendQueueMessage = async (doc: MessageQueueItem, successCallback?: () => Promise<unknown> | unknown) => {
  const onSuccess: WAMessageOutgoingCallback = async ({ fromNumber }, raw) => {
    const messageId = raw?.key.id;
    if (!messageId || !fromNumber) return;

    await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { messageId, instanceNumber: fromNumber } });
  };

  const onUpdate = async (messageId: string, deliveryStatus: WAMessageDelivery) => {
    const currentDelivery = deliveryCache.get(messageId);

    if (currentDelivery && currentDelivery.status === deliveryStatus.status) return;
    deliveryCache.set(messageId, deliveryStatus);

    if (SENT_STATUSES.includes(deliveryStatus.status as MessageStatusEnum)) {
      await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), messageId } });
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
      successCallback?.();
    } else if (deliveryStatus.status === MessageStatusEnum.ERROR) {
      // Update queue with error details and increment attempt
      await WhatsappQueue.updateOne(
        { _id: doc._id },
        { $set: { messageId, lastError: deliveryStatus.errorMessage }, $unset: { sentAt: 1 }, $inc: { attempt: 1 } }
      );

      // Broadcast failure event
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, {
        ...doc,
        attempt: (doc.attempt || 0) + 1,
        maxAttempts: MAX_SEND_ATTEMPT,
        error: deliveryStatus.errorMessage,
      });
    }
  };

  // If this is a retry, check if the last attempt was actually sent
  if (doc.attempt > 0 && doc.messageId) {
    const lastTry = await WhatsAppMessage.findOne({ messageId: doc.messageId }, { status: 1 });

    if (lastTry?.status && SENT_STATUSES.includes(lastTry.status as MessageStatusEnum)) {
      await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { sentAt: lastTry.sentAt }, $unset: { lastError: 1 } });

      return;
    }
  }

  try {
    await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime() }, $unset: { lastError: 1 } });

    if (doc.tts) {
      const openAi = new OpenAiService();
      const audioSvc = new AudioService();
      const ttsBuf = await openAi.textToSpeech(doc.textMessage, 'ogg');
      if (!ttsBuf) throw new Error('TTS failed: empty buffer');

      const ogg = await audioSvc.ensureOpusOgg(ttsBuf);
      const seconds = await audioSvc.getDurationSeconds(ogg, 'audio/ogg');

      await wa.sendMessage(
        null,
        doc.phoneNumber,
        { type: 'audio', data: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true, duration: seconds, text: doc.textMessage },
        { waitForDelivery: false, onWhatsapp: true, maxRetries: 1, onSuccess, onUpdate }
      );

      return;
    }

    await wa.sendMessage(null, doc.phoneNumber, doc.textMessage, {
      waitForDelivery: false,
      onWhatsapp: true,
      maxRetries: 1,
      onSuccess,
      onUpdate,
    });
  } catch {
    await WhatsappQueue.updateOne({ _id: doc._id }, { $inc: { attempt: 1 } });
  }
};
