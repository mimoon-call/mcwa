import type { Pagination } from '@models';
import type { BaseResponse } from '@server/models/base-response';
import {
  AddMessageQueueReq,
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

let isSending = false;
let messageCount = 0;
let messagePass = 0;

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    const data = await MessageQueueDb.pagination<MessageQueueItem>(
      { page },
      [
        { $match: { sentAt: { $exists: !!hasBeenSent } } },
        { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1, instanceNumber: 1, createdAt: 1 } },
      ],
      []
    );

    messageCount = data.totalItems;
    app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });

    return data;
  },

  [ADD_MESSAGE_QUEUE]: async (textMessage: string, data: AddMessageQueueReq['data']): Promise<BaseResponse> => {
    const bulk = data.map((value) => ({ ...value, textMessage: replaceStringVariable(textMessage, value), createdAt: getLocalTime() }));
    await MessageQueueDb.insertMany(bulk);

    return { returnCode: 0 };
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
    (async () => {
      isSending = true;
      messageCount = await MessageQueueDb.countDocuments({ sentAt: { $exists: false } });
      app.socket.onConnected<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, () => ({ messageCount, messagePass, isSending }));

      let doc = await MessageQueueDb.findOne({ sentAt: { $exists: false } });

      while (doc && isSending) {
        await sendQueueMessage(doc);

        messagePass++;
        app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });
        [doc] = await MessageQueueDb.aggregate([{ $match: { sentAt: { $exists: false } } }, { $sample: { size: 1 } }]);
      }

      isSending = false;
      messageCount = 0;
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
    messageCount = 0;

    return { returnCode: 0 };
  },

  [CLEAR_MESSAGE_QUEUE]: async (): Promise<BaseResponse> => {
    if (isSending) {
      isSending = false;
      messageCount = 0;
      messagePass = 0;
      app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, messagePass: 0, isSending });
    }

    await MessageQueueDb.deleteMany({ sentAt: { $exists: false } });

    return { returnCode: 0 };
  },
};
