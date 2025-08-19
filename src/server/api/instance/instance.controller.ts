import type { Request, Response } from 'express';
import {
  AddInstanceRes,
  GetInstanceConversationReq,
  GetInstanceConversationRes,
  GetInstanceConversationsReq,
  GetInstanceConversationsRes,
  SearchInstanceReq,
  SearchInstanceRes,
} from '@server/api/instance/instance.types';
import RecordValidator from '@server/services/record-validator';
import {
  ADD_INSTANCE,
  DELETE_INSTANCE,
  GET_INSTANCE_CONVERSATION,
  GET_INSTANCE_CONVERSATIONS,
  SEARCH_INSTANCE,
} from '@server/api/instance/instance.map';
import { instanceService } from '@server/api/instance/instance.service';
import { MAX_PAGE_SIZE } from '@server/constants';
import { INSTANCE_PHONE_NUMBER } from '@server/api/instance/instance.regex';

export const instanceController = {
  [SEARCH_INSTANCE]: async (req: Request<never, never, SearchInstanceReq>, res: Response<SearchInstanceRes>) => {
    const { page } = await new RecordValidator(req.body, [
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await instanceService[SEARCH_INSTANCE](page));
  },

  [GET_INSTANCE_CONVERSATION]: async (
    req: Request<{ phoneNumber: string }, never, GetInstanceConversationReq>,
    res: Response<GetInstanceConversationRes>
  ) => {
    const { phoneNumber, withPhoneNumber } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['phoneNumber', { type: ['String'], regex: [INSTANCE_PHONE_NUMBER] }],
      ['withPhoneNumber', { required: [true], type: ['String'] }],
    ]).validate();

    const messages = await instanceService[GET_INSTANCE_CONVERSATION](phoneNumber, withPhoneNumber);

    res.send({ messages });
  },

  [GET_INSTANCE_CONVERSATIONS]: async (
    req: Request<{ phoneNumber: string }, never, GetInstanceConversationsReq>,
    res: Response<GetInstanceConversationsRes>
  ) => {
    const { page, phoneNumber } = await new RecordValidator({ ...req.params, ...req.body }, [
      ['phoneNumber', { type: ['String'], regex: [INSTANCE_PHONE_NUMBER] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await instanceService[GET_INSTANCE_CONVERSATIONS](phoneNumber, page));
  },

  [ADD_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<AddInstanceRes>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [INSTANCE_PHONE_NUMBER] }]]).validate();
    const image = await instanceService[ADD_INSTANCE](phoneNumber);

    res.send({ image });
  },

  [DELETE_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<void>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [INSTANCE_PHONE_NUMBER] }]]).validate();
    await instanceService[DELETE_INSTANCE](phoneNumber);

    res.send();
  },
};
