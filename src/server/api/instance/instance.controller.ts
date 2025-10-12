import type { Request, Response } from 'express';
import { AddInstanceRes, ExportInstancesToExcelReq, SearchInstanceReq, SearchInstanceRes } from '@server/api/instance/instance.types';
import RecordValidator from '@server/services/record-validator';
import {
  ACTIVE_TOGGLE_INSTANCE,
  ADD_INSTANCE,
  DELETE_INSTANCE,
  EXPORT_INSTANCES_TO_EXCEL,
  INSTANCE_REFRESH,
  RESET_INSTANCE,
  SEARCH_INSTANCE,
  UPDATE_INSTANCE_COMMENT,
  WARMUP_TOGGLE,
  WARMUP_TOGGLE_INSTANCE,
} from '@server/api/instance/instance.map';
import { instanceService } from '@server/api/instance/instance.service';
import { MAX_PAGE_SIZE, RegexPattern } from '@server/constants';
import { BaseResponse } from '@server/models';
import { CellTypeEnum } from '@server/services/excel/cell-type.enum';

export const instanceController = {
  [SEARCH_INSTANCE]: async (req: Request<never, never, SearchInstanceReq>, res: Response<SearchInstanceRes>) => {
    const { page, ...data } = await new RecordValidator(req.body, [
      ['isActive', { type: ['Boolean'] }],
      ['hasWarmedUp', { type: ['Boolean'] }],
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

  [WARMUP_TOGGLE_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<void>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    await instanceService[WARMUP_TOGGLE_INSTANCE](phoneNumber);

    res.send();
  },

  [INSTANCE_REFRESH]: async (req: Request<{ phoneNumber: string }>, res: Response<void>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    await instanceService[INSTANCE_REFRESH](phoneNumber);

    res.send();
  },

  [WARMUP_TOGGLE]: async (_req: Request, res: Response<BaseResponse<{ isWarmingUp: boolean }>>) => {
    const result = await instanceService[WARMUP_TOGGLE]();

    res.send({ ...result, returnCode: 0 });
  },

  [EXPORT_INSTANCES_TO_EXCEL]: async (req: Request<never, never, ExportInstancesToExcelReq>, res: Response<Buffer>): Promise<void> => {
    const data = await new RecordValidator(req.body, [
      ['isActive', { type: ['Boolean'] }],
      ['hasWarmedUp', { type: ['Boolean'] }],
      ['statusCode', { type: ['Number'] }],
      ['headers.*.title', { type: ['String'], required: [true] }],
      ['headers.*.value', { type: ['String'], required: [true] }],
      ['headers.*.type', { type: ['String'], equal: [Object.values(CellTypeEnum)] }],
    ]).validate();

    const { buffer, fileName } = await instanceService[EXPORT_INSTANCES_TO_EXCEL](data);

    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buffer);
  },

  [UPDATE_INSTANCE_COMMENT]: async (req: Request<{ phoneNumber: string }, never, { comment: string }>, res: Response<BaseResponse>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    const { comment } = await new RecordValidator(req.body, [['comment', { type: ['String'] }]]).validate();

    await instanceService[UPDATE_INSTANCE_COMMENT](phoneNumber, comment);

    res.send({ returnCode: 0 });
  },

  [RESET_INSTANCE]: async (req: Request<{ phoneNumber: string }>, res: Response<BaseResponse>) => {
    const { phoneNumber } = await new RecordValidator(req.params, [['phoneNumber', { type: ['String'], regex: [RegexPattern.PHONE_IL] }]]).validate();
    await instanceService[RESET_INSTANCE](phoneNumber);

    res.send({ returnCode: 0 });
  },
};
