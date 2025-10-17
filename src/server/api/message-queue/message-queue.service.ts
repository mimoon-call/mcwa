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
  RESUBSCRIBE_NUMBER,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
  UNSUBSCRIBE_NUMBER,
} from '@server/api/message-queue/message-queue.map';
import { WhatsappQueue } from '@server/api/message-queue/whatsapp.queue';
import { app, wa } from '@server/index';
import { MessageQueueEventEnum } from '@server/api/message-queue/message-queue-event.enum';
import replaceStringVariable from '@server/helpers/replace-string-variable';
import { sendQueueMessage } from '@server/api/message-queue/helpers/send-queue-message';
import getLocalTime from '@server/helpers/get-local-time';
import { WhatsAppUnsubscribe } from '@server/services/whatsapp/whatsapp.db';
import { WORKDAYS, WORKHOURS, TIMEZONE, MAX_SEND_ATTEMPT } from './message-queue.constants';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import ServerError from '@server/middleware/errors/server-error';
import { ErrorCodeEnum } from '@services/http/errors/error-code.enum';

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

let isSending = false;
let messageCount = 0;
let messagePass = 0;
let messageAttempt = 0;

// Check if current time is within work hours and workdays
const isWithinWorkHours = (): boolean => {
  const now = dayjs().tz(TIMEZONE);
  const currentDay = now.day(); // 0 = Sunday, 1 = Monday, etc.
  const currentHour = now.hour();

  // Check if current day is a workday
  const isWorkday = WORKDAYS.includes(currentDay);

  // Check if current hour is within work hours
  const isWorkHour = currentHour >= WORKHOURS[0] && currentHour < WORKHOURS[1];

  return isWorkday && isWorkHour;
};

export const messageQueueService = {
  [SEARCH_MESSAGE_QUEUE]: async (page: Pagination, hasBeenSent?: boolean): Promise<SearchMessageQueueRes> => {
    const data = await WhatsappQueue.pagination<MessageQueueItem>(
      { page },
      [
        { $match: { sentAt: { $exists: !!hasBeenSent } } },
        { $project: { phoneNumber: 1, fullName: 1, textMessage: 1, sentAt: 1, instanceNumber: 1, createdAt: 1, lastError: 1, attempt: 1 } },
        { $sort: { attempt: 1 } },
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
      .map(({ phoneNumber, columns }) => {
        return {
          phoneNumber,
          textMessage: replaceStringVariable(textMessage, { phoneNumber, ...(columns || {}) }),
          tts,
          createdAt: getLocalTime(),
        };
      });

    const inserted = await WhatsappQueue.insertMany(bulk);
    messageCount = await WhatsappQueue.countDocuments({ sentAt: { $exists: false } });

    return { returnCode: 0, addedCount: inserted.length, blockedCount: blocked.length };
  },

  [EDIT_MESSAGE_QUEUE]: async ({ _id, ...data }: EditMessageQueueReq): Promise<BaseResponse> => {
    const id = new ObjectId(_id);
    await WhatsappQueue.updateOne({ _id: id }, { $set: data });

    return { returnCode: 0 };
  },

  [REMOVE_MESSAGE_QUEUE]: async (queueId: string): Promise<BaseResponse> => {
    const _id = new ObjectId(queueId);
    await WhatsappQueue.deleteOne({ _id });

    return { returnCode: 0 };
  },

  [START_QUEUE_SEND]: async (): Promise<BaseResponse<{ totalInstances: number; totalMessages: number }>> => {
    // Check if we're within work hours before starting
    if (!isWithinWorkHours()) throw new ServerError('QUEUE.ERROR_SENDING_OUTSIDE_WORKTIME', ErrorCodeEnum.BAD_REQUEST_400);

    const totalInstances = wa.listInstanceNumbers({ hasWarmedUp: true, onlyConnectedFlag: true }).length;
    if (totalInstances === 0) throw new ServerError('QUEUE.ERROR_NO_ACTIVE_INSTANCES', ErrorCodeEnum.BAD_REQUEST_400);

    messageAttempt = 0;

    (async () => {
      isSending = true;
      messagePass = 0;
      app.socket.onConnected<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, () => ({ messageCount, messagePass, isSending }));

      for (messageAttempt = 0; messageAttempt < MAX_SEND_ATTEMPT; messageAttempt++) {
        // Process all documents with current attempt number (randomly)
        let hasMoreDocs = true;

        while (hasMoreDocs && isSending) {
          // Check work hours before each message
          if (!isWithinWorkHours()) {
            isSending = false;
            app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });
            return;
          }

          // Get next document with current attempt number (randomly)
          const docs = await WhatsappQueue.aggregate<MessageQueueItem>([
            { $match: { sentAt: { $exists: false }, attempt: messageAttempt } },
            { $sample: { size: 1 } },
          ]);

          if (docs.length === 0) {
            hasMoreDocs = false;
            break;
          }

          const doc = docs[0];

          await sendQueueMessage(doc, () => {
            messagePass++;
            app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });
          });
        }
      }

      isSending = false;
      app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount, messagePass, isSending });
    })();

    return { returnCode: 0, totalInstances, totalMessages: messageCount };
  },

  [STOP_QUEUE_SEND]: (): BaseResponse => {
    if (!messageCount) return { returnCode: 1 };

    app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, messagePass: 0, isSending });
    isSending = false;

    return { returnCode: 0 };
  },

  [CLEAR_MESSAGE_QUEUE]: async (): Promise<BaseResponse> => {
    if (isSending) {
      isSending = false;
      app.socket.broadcast<MessageQueueActiveEvent>(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, { messageCount: 0, messagePass: 0, isSending });
    }

    await WhatsappQueue.deleteMany({ sentAt: { $exists: false } });

    return { returnCode: 0 };
  },

  [UNSUBSCRIBE_NUMBER]: async (phoneNumber: string): Promise<BaseResponse> => {
    await WhatsAppUnsubscribe.insertOne({ phoneNumber, createdAt: getLocalTime() });

    return { returnCode: 0 };
  },

  [RESUBSCRIBE_NUMBER]: async (phoneNumber: string): Promise<BaseResponse> => {
    await WhatsAppUnsubscribe.deleteOne({ phoneNumber });

    return { returnCode: 0 };
  },
};
