import type { Pagination } from '@models';
import type { AddMessageQueueReq, MessageQueueItem, SearchMessageQueueRes } from '@server/api/message-queue/message-queue.types';
import {
  ADD_MESSAGE_QUEUE,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
} from '@server/api/message-queue/message-queue.map';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { BaseResponse } from '@server/models/base-response';
import { ObjectId } from 'mongodb';
import { app, wa } from '@server/index';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import replaceStringVariable from '@server/helpers/replace-string-variable';

let messageCount = 0;
let messagePass = 0;

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    const data = await MessageQueueDb.pagination<MessageQueueItem>(
      { page },
      [
        { $match: { sentAt: { $exists: !!hasBeenSent }, failedAt: { $exists: !!hasBeenSent } } },
        { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1, instanceNumber: 1 } },
      ],
      []
    );

    return { ...data, isSending: messageCount > 0 };
  },

  [ADD_MESSAGE_QUEUE]: async (textMessage: string, data: AddMessageQueueReq['data']): Promise<BaseResponse> => {
    const bulk = data.map((value) => ({ ...value, textMessage: replaceStringVariable(textMessage, value) }));
    await MessageQueueDb.insertMany(bulk);

    return { returnCode: 0 };
  },

  [REMOVE_MESSAGE_QUEUE]: async (queueId: string): Promise<BaseResponse> => {
    const _id = new ObjectId(queueId);
    await MessageQueueDb.deleteOne({ _id });

    return { returnCode: 0 };
  },

  [START_QUEUE_SEND]: (): void => {
    if (messageCount) {
      return;
    }

    (async () => {
      messageCount = await MessageQueueDb.countDocuments({ sentAt: { $exists: false } });
      let doc = await MessageQueueDb.findOne({ sentAt: { $exists: false } });

      while (doc) {
        try {
          const textMessage = replaceStringVariable(doc.textMessage, doc);
          const { instanceNumber } = await wa.sendMessage(null, doc.phoneNumber, textMessage);
          await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: new Date(), instanceNumber } });
          app.socket.broadcast(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
          await new Promise((resolve) => setTimeout(resolve, 20000)); // wait 20 seconds between messages
        } catch (e) {
          await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: new Date(), lastError: String(e) } });
          app.socket.broadcast(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, { ...doc, error: String(e) });
        } finally {
          doc = await MessageQueueDb.findOne({ sentAt: { $exists: false } });
          messagePass++;
          app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending: true });
        }
      }

      app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending: false });
      messageCount = 0;
    })();
  },

  [STOP_QUEUE_SEND]: async (): Promise<void> => {
    messageCount = 0;
    app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, leftCount: 0, isSending: false });
  },
};
