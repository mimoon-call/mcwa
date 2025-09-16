import type { Request, Response } from 'express';
import type {
  GetConversationReq,
  GetConversationRes,
  SearchConversationReq,
  SearchConversationRes,
  SearchAllConversationsReq,
  SearchAllConversationsRes,
  SendMessageReq,
  DeleteConversationReq,
  DeleteConversationRes,
} from '@server/api/conversation/conversation.types';
import RecordValidator from '@server/services/record-validator';
import { MAX_PAGE_SIZE, RegexPattern } from '@server/constants';
import {
  GET_CONVERSATION,
  SEARCH_CONVERSATIONS,
  SEARCH_ALL_CONVERSATIONS,
  SEND_MESSAGE,
  DELETE_CONVERSATION,
} from '@server/api/conversation/conversation.map';
import { conversationService } from '@server/api/conversation/conversation.service';
import { BaseResponse } from '@server/models';

export const conversationController = {
  [GET_CONVERSATION]: async (
    req: Request<{ phoneNumber: string; withPhoneNumber?: string }, never, GetConversationReq>,
    res: Response<GetConversationRes>
  ) => {
    const { phoneNumber, withPhoneNumber, page } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['withPhoneNumber', { required: [true], type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await conversationService[GET_CONVERSATION](phoneNumber, withPhoneNumber, page));
  },

  [SEARCH_ALL_CONVERSATIONS]: async (req: Request<never, never, SearchAllConversationsReq>, res: Response<SearchAllConversationsRes>) => {
    const { page, searchValue, intents, departments, interested } = await new RecordValidator(req.body, [
      ['searchValue', { type: ['String'] }],
      ['intents', { type: [['Array', 'Null']] }],
      ['departments', { type: [['Array', 'Null']] }],
      ['interested', { type: [['Boolean', 'Null']] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await conversationService[SEARCH_ALL_CONVERSATIONS](page, searchValue, intents, departments, interested ?? undefined));
  },

  [SEARCH_CONVERSATIONS]: async (req: Request<{ phoneNumber: string }, never, SearchConversationReq>, res: Response<SearchConversationRes>) => {
    const { page, phoneNumber, searchValue, externalFlag } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['searchValue', { type: ['String'] }],
      ['externalFlag', { type: ['Boolean'] }],
      ['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await conversationService[SEARCH_CONVERSATIONS](phoneNumber, page, searchValue, externalFlag));
  },

  [SEND_MESSAGE]: async (req: Request<{ fromNumber: string; toNumber: string }, never, SendMessageReq>, res: Response<BaseResponse>) => {
    const { fromNumber, toNumber, textMessage } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['fromNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['toNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['textMessage', { type: ['String'], minLength: [1] }],
    ]).validate();

    res.send(await conversationService[SEND_MESSAGE](fromNumber, toNumber, textMessage));
  },

  [DELETE_CONVERSATION]: async (
    req: Request<{ fromNumber: string; toNumber: string }, never, DeleteConversationReq>,
    res: Response<DeleteConversationRes>
  ) => {
    const { fromNumber, toNumber } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['fromNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['toNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
    ]).validate();

    res.send(await conversationService[DELETE_CONVERSATION](fromNumber, toNumber));
  },
};
