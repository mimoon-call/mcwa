import type { Request, Response } from 'express';
import { AddInstanceRes, SearchInstanceReq, SearchInstanceRes } from '@server/api/instance/instance.types';
import RecordValidator from '@server/services/record-validator';
import { ACTIVE_TOGGLE_INSTANCE, ADD_INSTANCE, DELETE_INSTANCE, INSTANCE_REFRESH, SEARCH_INSTANCE } from '@server/api/instance/instance.map';
import { instanceService } from '@server/api/instance/instance.service';
import { MAX_PAGE_SIZE, RegexPattern } from '@server/constants';

export const instanceController = {
  [SEARCH_INSTANCE]: async (req: Request<never, never, SearchInstanceReq>, res: Response<SearchInstanceRes>) => {
    const { page, ...data } = await new RecordValidator(req.body, [
      ['isActive', { type: ['Boolean'] }],
      ['statusCode', { type: ['Number'] }],
      ['phoneNumber', { type: ['String'], required: [false] }],
      ['page.pageSize', { type: ['Number'], max: [MAX_PAGE_SIZE] }],
      ['page.pageIndex', { type: ['Number'] }],
      ['page.pageSort', { type: [['Object', 'Null']] }],
    ]).validate();

    res.send(await instanceService[SEARCH_INSTANCE](data, page));
  },

  [ADD_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<AddInstanceRes>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    const image = await instanceService[ADD_INSTANCE](phoneNumber);

    res.send({ image });
  },

  [DELETE_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<void>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    await instanceService[DELETE_INSTANCE](phoneNumber);

    res.send();
  },

  [ACTIVE_TOGGLE_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<void>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    await instanceService[ACTIVE_TOGGLE_INSTANCE](phoneNumber);

    res.send();
  },

  [INSTANCE_REFRESH]: async (req: Request<{ phoneNumber: string }>, res: Response<void>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    await instanceService[INSTANCE_REFRESH](phoneNumber);

    res.send();
  },
};
