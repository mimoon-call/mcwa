import type { WAMessageDelivery } from '@server/services/whatsapp/whatsapp-instance.type';
import type { MessageQueueItem, MessageQueueSendEvent } from '@server/api/message-queue/message-queue.types';
import replaceStringVariable from '@server/helpers/replace-string-variable';
import { app, wa } from '@server/index';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import getLocalTime from '@server/helpers/get-local-time';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { AudioService } from '@server/services/ffmpeg/ffmpeg.service';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';

const SENT_STATUSES = [MessageStatusEnum.SENT, MessageStatusEnum.DELIVERED, MessageStatusEnum.READ, MessageStatusEnum.PLAYED];

export const sendQueueMessage = async (doc: MessageQueueItem, successCallback?: () => Promise<unknown> | unknown) => {
  const onUpdate = async (messageId: string, deliveryStatus: WAMessageDelivery) => {
    if (SENT_STATUSES.includes(deliveryStatus.status as MessageStatusEnum)) {
      await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), messageId } });
      successCallback?.();
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
          { onUpdate }
        );
      }

      return await wa.sendMessage(null, doc.phoneNumber, textMessage, {});
    })();

    // Check if message was sent successfully (even if delivery confirmation timed out)
    const messageSent = messageResult && messageResult.key && messageResult.key.id;

    if (messageSent) {
      await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: getLocalTime(), instanceNumber: messageResult.key.id } });
      app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
    } else {
      throw new Error('Message was not sent successfully - no message ID returned');
    }
  } catch (e) {
    // Final attempt failed, mark as failed
    await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { lastError: String(e) }, $inc: { attempt: 1 } });
    app.socket.broadcast<MessageQueueSendEvent>(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, { ...doc, error: String(e) });
  }
};
