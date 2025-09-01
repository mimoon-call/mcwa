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

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    const data = await MessageQueueDb.pagination<MessageQueueItem>(
      { page },
      [{ $match: { sentAt: { $exists: !!hasBeenSent } } }, { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1 } }],
      []
    );

    return { ...data, isSending: messageCount > 0 };
  },

  [ADD_MESSAGE_QUEUE]: async (textMessage: string, data: AddMessageQueueReq['data']): Promise<BaseResponse> => {
    const bulk = data.map((value) => ({ ...value, textMessage }));
    await MessageQueueDb.insertMany(bulk);

    return { returnCode: 0 };
  },

  [REMOVE_MESSAGE_QUEUE]: async (queueId: string): Promise<BaseResponse> => {
    const _id = new ObjectId(queueId);
    await MessageQueueDb.deleteOne({ _id });

    return { returnCode: 0 };
  },

  [START_QUEUE_SEND]: async (): Promise<void> => {
    if (messageCount) {
      return;
    }

    messageCount = await MessageQueueDb.countDocuments({ sentAt: { $exists: false }, failedAt: { $exists: false } });
    app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVATED, { messageCount, isSending: messageCount > 0 });

    let doc = await MessageQueueDb.findOne({ sentAt: { $exists: false }, failedAt: { $exists: false } });

    while (doc && messageCount > 0) {
      app.socket.onConnected(MessageQueueEventEnum.QUEUE_SEND_ACTIVATED, () => [{ messageCount, isSending: messageCount > 0 }]);

      try {
        const textMessage = replaceStringVariable(doc.textMessage, doc);
        await wa.sendMessage('972504381216', doc.phoneNumber, textMessage);
        await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { sentAt: new Date() } });
        app.socket.broadcast(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, doc);
      } catch (e) {
        await MessageQueueDb.updateOne({ _id: doc._id }, { $set: { failedAt: new Date(), lastError: String(e) } });
        app.socket.broadcast(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, doc);
      } finally {
        doc = await MessageQueueDb.findOne({ sentAt: { $exists: false }, failedAt: { $exists: false } });
      }
    }

    messageCount = 0;
  },

  [STOP_QUEUE_SEND]: async (): Promise<void> => {
    messageCount = 0;
    app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_DEACTIVATED, { messageCount });
  },
};
