import type { Request, Response } from 'express';
import {
  ADD_MESSAGE_QUEUE,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
} from '@server/api/message-queue/message-queue.map';
import { AddMessageQueueReq, SearchMessageQueueReq, SearchMessageQueueRes } from '@server/api/message-queue/message-queue.types';
import RecordValidator from '@server/services/record-validator';
import { MAX_PAGE_SIZE, RegexPattern } from '@server/constants';
import { messageQueueService } from '@server/api/message-queue/message-queue.service';
import { BaseResponse } from '@server/models/base-response';

export const messageQueueController = {
  [SEARCH_MESSAGE_QUEUE]: async (req: Request<never, never, SearchMessageQueueReq>, res: Response<SearchMessageQueueRes>) => {
    const { page, hasBeenSent } = await new RecordValidator(req.body, [
      ['hasBeenSent', { type: ['Boolean'] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await messageQueueService[SEARCH_MESSAGE_QUEUE](page, hasBeenSent));
  },

  [ADD_MESSAGE_QUEUE]: async (req: Request<never, never, AddMessageQueueReq>, res: Response<BaseResponse>) => {
    const { textMessage, data } = await new RecordValidator(req.body, [
      ['textMessage', { required: [true] }],
      ['data.*.phoneNumber', { required: [true], regex: [RegexPattern.PHONE_IL] }],
      ['data.*.fullName', { required: [true] }],
    ]).validate();

    res.send(await messageQueueService[ADD_MESSAGE_QUEUE](textMessage, data));
  },

  [REMOVE_MESSAGE_QUEUE]: async (req: Request<{ queueId: string }>, res: Response<BaseResponse>) => {
    const { queueId } = await new RecordValidator(req.params, [['queueId', { required: [true] }]]).validate();

    res.send(await messageQueueService[REMOVE_MESSAGE_QUEUE](queueId));
  },

  [START_QUEUE_SEND]: async (_req: Request, res: Response<BaseResponse>) => {
    res.send(messageQueueService[START_QUEUE_SEND]());
  },

  [STOP_QUEUE_SEND]: async (_req: Request, res: Response<BaseResponse>) => {
    res.send(messageQueueService[STOP_QUEUE_SEND]());
  },
};
