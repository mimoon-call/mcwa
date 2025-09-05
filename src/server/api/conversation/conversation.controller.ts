import type { Request, Response } from 'express';
import type {
  GetConversationReq,
  GetConversationRes,
  SearchConversationReq,
  SearchConversationRes,
} from '@server/api/conversation/conversation.types';
import RecordValidator from '@server/services/record-validator';
import { MAX_PAGE_SIZE, RegexPattern } from '@server/constants';
import { GET_CONVERSATION, SEARCH_CONVERSATIONS } from '@server/api/conversation/conversation.map';
import { conversationService } from '@server/api/conversation/conversation.service';

export const conversationController = {
  [GET_CONVERSATION]: async (req: Request<{ phoneNumber: string }, never, GetConversationReq>, res: Response<GetConversationRes>) => {
    const { phoneNumber, withPhoneNumber, page } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['withPhoneNumber', { required: [true], type: ['String'] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await conversationService[GET_CONVERSATION](phoneNumber, withPhoneNumber, page));
  },

  [SEARCH_CONVERSATIONS]: async (req: Request<{ phoneNumber: string }, never, SearchConversationReq>, res: Response<SearchConversationRes>) => {
    const { page, phoneNumber } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await conversationService[SEARCH_CONVERSATIONS](phoneNumber, page));
  },
};
