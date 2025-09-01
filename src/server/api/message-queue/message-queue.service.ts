import type { Pagination } from '@models';
import type { AddMessageQueueReq, MessageQueueItem, SearchMessageQueueRes } from '@server/api/message-queue/message-queue.types';
import type { BaseResponse } from '@server/models/base-response';
import { ObjectId } from 'mongodb';
import {
  ADD_MESSAGE_QUEUE,
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

let messageCount = 0;
let messagePass = 0;

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    return await MessageQueueDb.pagination<MessageQueueItem>(
      { page },
      [
        { $match: { sentAt: { $exists: !!hasBeenSent } } },
        { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1, instanceNumber: 1 } },
      ],
      []
    );
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

  [START_QUEUE_SEND]: (): BaseResponse => {
    if (messageCount) {
      return { returnCode: 0 };
    }

    (async () => {
      messageCount = await MessageQueueDb.countDocuments({ sentAt: { $exists: false } });

      let doc = await MessageQueueDb.findOne({ sentAt: { $exists: false } });

      while (doc) {
        await sendQueueMessage(doc);

        doc = await MessageQueueDb.findOne({ sentAt: { $exists: false } });
        messagePass++;
        app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending: true });
      }

      app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending: false });
      messageCount = 0;
    })();

    return { returnCode: 0 };
  },

  [STOP_QUEUE_SEND]: (): BaseResponse => {
    if (!messageCount) {
      return { returnCode: 1 };
    }

    messageCount = 0;
    app.socket.broadcast(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, leftCount: 0, isSending: false });

    return { returnCode: 0 };
  },
};
