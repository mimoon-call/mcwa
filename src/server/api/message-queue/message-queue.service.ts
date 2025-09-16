import type { Pagination } from '@models';
import type { BaseResponse } from '@server/models/base-response';
import {
  AddMessageQueueReq,
  AddMessageQueueRes,
  EditMessageQueueReq,
  MessageQueueActiveEvent,
  MessageQueueItem,
  SearchMessageQueueRes,
} from '@server/api/message-queue/message-queue.types';
import { ObjectId } from 'mongodb';
import {
  ADD_MESSAGE_QUEUE,
  CLEAR_MESSAGE_QUEUE,
  EDIT_MESSAGE_QUEUE,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
} from '@server/api/message-queue/message-queue.map';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { app } from '@server/index';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import replaceStringVariable from '@server/helpers/replace-string-variable';
import { sendQueueMessage } from '@server/api/message-queue/helpers/send-queue-message';
import getLocalTime from '@server/helpers/get-local-time';
import { WhatsAppUnsubscribe } from '@server/services/whatsapp/whatsapp.db';

let isSending = false;
let messageCount = 0;
let messagePass = 0;
let messageAttempt = 0;

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    const data = await MessageQueueDb.pagination<MessageQueueItem>(
      { page },
      [
        { $match: { sentAt: { $exists: !!hasBeenSent } } },
        { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1, instanceNumber: 1, createdAt: 1, lastError: 1, attempt: 1 } },
      ],
      []
    );

    app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });

    return data;
  },

  [ADD_MESSAGE_QUEUE]: async (textMessage: string, tts: boolean, data: AddMessageQueueReq['data']): Promise<AddMessageQueueRes> => {
    const blocked = (await WhatsAppUnsubscribe.find({ phoneNumber: { $in: data.map((d) => d.phoneNumber) } }, { phoneNumber: 1, _id: 0 })).map(
      (doc) => doc.phoneNumber
    );

    const bulk = data
      .filter(({ phoneNumber }) => !blocked.includes(phoneNumber))
      .map((value) => ({ ...value, textMessage: replaceStringVariable(textMessage, value), tts, createdAt: getLocalTime() }));

    const inserted = await MessageQueueDb.insertMany(bulk);

    return { returnCode: 0, addedCount: inserted.length, blockedCount: blocked.length };
  },

  [EDIT_MESSAGE_QUEUE]: async ({ _id, ...data }: EditMessageQueueReq): Promise<BaseResponse> => {
    const id = new ObjectId(_id);
    await MessageQueueDb.updateOne({ _id: id }, { $set: data });

    return { returnCode: 0 };
  },

  [REMOVE_MESSAGE_QUEUE]: async (queueId: string): Promise<BaseResponse> => {
    const _id = new ObjectId(queueId);
    await MessageQueueDb.deleteOne({ _id });

    return { returnCode: 0 };
  },

  [START_QUEUE_SEND]: (): BaseResponse => {
    messageAttempt = 0;

    (async () => {
      isSending = true;
      messagePass = 0;
      messageCount = await MessageQueueDb.countDocuments({ sentAt: { $exists: false } });
      app.socket.onConnected<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, () => ({ messageCount, messagePass, isSending }));

      for (messageAttempt = 0; messageAttempt < 3; messageAttempt++) {
        // Process all documents with current attempt number (randomly)
        let doc = await MessageQueueDb.findOne({ sentAt: { $exists: false }, attempt: messageAttempt });

        while (doc && isSending) {
          await sendQueueMessage(doc, () => messagePass++);
          await new Promise((resolve) => setTimeout(resolve, 20000));

          app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });

          // Get next document with same attempt number (randomly)
          [doc] = await MessageQueueDb.aggregate([{ $match: { sentAt: { $exists: false }, attempt: messageAttempt } }, { $sample: { size: 1 } }]);
        }
      }

      isSending = false;
      app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });
    })();

    return { returnCode: 0 };
  },

  [STOP_QUEUE_SEND]: (): BaseResponse => {
    if (!messageCount) {
      return { returnCode: 1 };
    }

    app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, messagePass: 0, isSending });
    isSending = false;

    return { returnCode: 0 };
  },

  [CLEAR_MESSAGE_QUEUE]: async (): Promise<BaseResponse> => {
    if (isSending) {
      isSending = false;
      app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, messagePass: 0, isSending });
    }

    await MessageQueueDb.deleteMany({ sentAt: { $exists: false } });

    return { returnCode: 0 };
  },
};
