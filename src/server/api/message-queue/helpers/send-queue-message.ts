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

const SENT_STATUSES = [MessageStatusEnum.DELIVERED, MessageStatusEnum.READ, MessageStatusEnum.PLAYED];

export const sendQueueMessage = async (doc: MessageQueueItem, successCallback?: () => Promise<unknown> | unknown) => {
  const onUpdate = async (messageId: string, deliveryStatus: WAMessageDelivery) => {
    if (SENT_STATUSES.includes(deliveryStatus.status as MessageStatusEnum)) {
      console.log('QUEUE', 'Message sent to', doc.phoneNumber, 'messageId:', messageId);
      await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), messageId } });
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
      successCallback?.();
    } else if (deliveryStatus.status === MessageStatusEnum.ERROR && messageId) {
      await WhatsAppMessage.deleteOne({ messageId });
    }
  };

  try {
    const textMessage = replaceStringVariable(doc.textMessage, doc);

    const messageResult = await (async () => {
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
          { onUpdate, waitForDelivery: true, deliveryTrackingTimeout: 45000, maxRetries: 1, throwOnDeliveryError: true }
        );
      }

      return await wa.sendMessage(null, doc.phoneNumber, textMessage, {
        onUpdate,
        waitForDelivery: true,
        deliveryTrackingTimeout: 45000,
        maxRetries: 1,
        throwOnDeliveryError: true,
      });
    })();

    // Check if message was sent successfully (even if delivery confirmation timed out)
    const messageSent = messageResult && messageResult.key && messageResult.key.id;

    if (messageSent) {
      await WhatsappQueue.updateOne(
        { _id: doc._id },
        { $set: { sentAt: getLocalTime(), instanceNumber: messageResult.instanceNumber, messageId: messageResult.key.id } }
      );
    } else {
      throw new Error('Message was not sent successfully - no message ID returned');
    }
  } catch (e) {
    // Final attempt failed, mark as failed
    await WhatsappQueue.updateOne({ _id: doc._id }, { $set: { lastError: String(e) }, $inc: { attempt: 1 } });

    app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, {
      ...doc,
      attempt: (doc.attempt || 0) + 1,
      error: String(e),
    });
  }
};
