import type { Pagination } from '@models';
import type { AddMessageQueueReq, MessageQueueItem, SearchMessageQueueRes } from '@server/api/message-queue/message-queue.types';
import {
  ADD_MESSAGE_QUEUE,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  SEND_ACTIVE,
  SEND_DISABLE,
} from '@server/api/message-queue/message-queue.map';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import { BaseResponse } from '@server/models/base-response';
import { ObjectId } from 'mongodb';
import { app, wa } from '@server/index';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';

let messageCount = 0;

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    return await MessageQueueDb.pagination<MessageQueueItem>(
      { page },
      [{ $match: { sentAt: { $exists: !!hasBeenSent } } }, { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1 } }],
      []
    );
  },

  [ADD_MESSAGE_QUEUE]: async (textMessage: string, data: AddMessageQueueReq['data']): Promise<BaseResponse> => {
    const bulk = data.map((value) => ({ ...value, textMessage }));

    await MessageQueueDb.insertMany(bulk);
    messageQueueService[SEND_ACTIVE]();
    return { returnCode: 0 };
  },

  [REMOVE_MESSAGE_QUEUE]: async (queueId: string): Promise<BaseResponse> => {
    const _id = new ObjectId(queueId);

    await MessageQueueDb.deleteOne({ _id });
    return { returnCode: 0 };
  },

  [SEND_ACTIVE]: async (): Promise<void> => {
    if (messageCount) {
      return;
    }

    messageCount = await MessageQueueDb.countDocuments({ sentAt: { $exists: false }, failedAt: { $exists: false } });
    app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVATED, { messageCount });

    let doc = await MessageQueueDb.findOne({ sentAt: { $exists: false }, failedAt: { $exists: false } });

    while (doc) {
      try {
        await wa.sendMessage('972504381216', doc.phoneNumber, doc.textMessage);
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

  [SEND_DISABLE]: async (): Promise<void> => {},
};
