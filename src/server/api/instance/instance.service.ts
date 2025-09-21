import type { EntityList, Pagination } from '@models';
import { ExportInstancesToExcelReq, InstanceItem, SearchInstanceReq } from '@server/api/instance/instance.types';
import {
  ACTIVE_TOGGLE_INSTANCE,
  ADD_INSTANCE,
  DELETE_INSTANCE,
  EXPORT_INSTANCES_TO_EXCEL,
  INSTANCE_REFRESH,
  SEARCH_INSTANCE,
  UPDATE_INSTANCE_COMMENT,
  WARMUP_TOGGLE,
} from '@server/api/instance/instance.map';
import { WhatsAppAuth, WhatsAppKey } from '@server/services/whatsapp/whatsapp.db';
import { wa } from '@server/index';
import ServerError from '@server/middleware/errors/server-error';
import ExcelService from '@server/services/excel/excel.service';
import getLocalTime from '@server/helpers/get-local-time';

export const instanceService = {
  [SEARCH_INSTANCE]: async (payload: Omit<SearchInstanceReq, 'page'>, page: Pagination): Promise<EntityList<InstanceItem>> => {
    const today = new Date().toISOString().split('T')[0];

    const pipeline = [];

    if (payload.phoneNumber) {
      pipeline.push({ $match: { phoneNumber: { $regex: String(+payload.phoneNumber), $options: 'i' } } });
    }

    if (payload.statusCode) {
      pipeline.push({ $match: { statusCode: payload.statusCode } });
    }

    if (payload.isActive !== undefined) {
      pipeline.push({ $match: { isActive: payload.isActive } });
    }

    if (payload.hasWarmedUp !== undefined) {
      pipeline.push({ $match: { hasWarmedUp: payload.hasWarmedUp } });
    }

    pipeline.push({
      $project: {
        phoneNumber: 1,
        isActive: 1,
        dailyMessageCount: { $cond: [{ $eq: ['$lastSentMessage', today] }, '$dailyMessageCount', 0] },
        outgoingErrorCount: { $ifNull: ['$outgoingErrorCount', 0] },
        outgoingMessageCount: 1,
        incomingMessageCount: 1,
        statusCode: 1,
        errorMessage: 1,
        lastErrorAt: 1,
        warmUpDay: 1,
        dailyWarmUpCount: { $cond: [{ $eq: ['$lastWarmedUpDay', today] }, '$dailyWarmUpCount', 0] },
        dailyWarmConversationCount: { $cond: [{ $eq: ['$lastWarmedUpDay', today] }, '$dailyWarmConversationCount', 0] },
        hasWarmedUp: 1,
        gender: 1,
        name: 1,
        createdAt: 1,
        lastIpAddress: 1,
        comment: 1,
      },
    });

    const { data, ...rest } = await WhatsAppAuth.pagination<InstanceItem>({ page }, pipeline, []);

    return {
      ...rest,
      data: data.map((item) => ({
        ...item,
        isWarmingUp: wa.isWarmingUp(item.phoneNumber),
        isConnected: !!wa.getInstance(item.phoneNumber)?.connected,
      })),
    };
  },

  [ADD_INSTANCE]: async (phoneNumber: string): Promise<string> => {
    const instance = wa.getInstance(phoneNumber);
    await instance?.disable();

    const { qrCode } = await wa.addInstanceQR(phoneNumber);

    return qrCode;
  },

  [DELETE_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    const instance = wa.getInstance(phoneNumber);

    await instance?.remove();
    await WhatsAppAuth.deleteOne({ phoneNumber });
    await WhatsAppKey.deleteMany({ phoneNumber });
  },

  [ACTIVE_TOGGLE_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    const instance = wa.getInstance(phoneNumber);

    if (!instance) {
      throw new ServerError('INSTANCE.NOT_FOUND');
    }

    const isActive = !!instance.get('isActive');
    if (isActive) {
      await instance.disable();
    } else {
      await instance.enable();
    }
  },

  [INSTANCE_REFRESH]: async (phoneNumber: string): Promise<void> => {
    const instance = wa.getInstance(phoneNumber);

    if (!instance) {
      throw new ServerError('INSTANCE.NOT_FOUND');
    }

    await instance.connect(true);
  },

  [WARMUP_TOGGLE]: async (): Promise<{ isWarmingUp: boolean }> => {
    if (wa.isWarming) {
      wa.stopWarmingUp();
    } else {
      wa.startWarmingUp();
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    return { isWarmingUp: wa.isWarming };
  },

  [EXPORT_INSTANCES_TO_EXCEL]: async ({ headers, ...payload }: ExportInstancesToExcelReq) => {
    const excelService = new ExcelService({});

    const today = getLocalTime().toISOString();
    const todayDate = today.split('T')[0];

    const pipeline = [];

    if (payload.statusCode) {
      pipeline.push({ $match: { statusCode: payload.statusCode } });
    }

    if (payload.isActive !== undefined) {
      pipeline.push({ $match: { isActive: payload.isActive } });
    }

    if (payload.hasWarmedUp !== undefined) {
      pipeline.push({ $match: { hasWarmedUp: payload.hasWarmedUp } });
    }

    pipeline.push({
      $project: {
        phoneNumber: 1,
        isActive: 1,
        dailyMessageCount: { $cond: [{ $eq: ['$lastSentMessage', todayDate] }, '$dailyMessageCount', 0] },
        outgoingErrorCount: { $ifNull: ['$outgoingErrorCount', 0] },
        outgoingMessageCount: 1,
        incomingMessageCount: 1,
        statusCode: 1,
        errorMessage: 1,
        lastErrorAt: 1,
        warmUpDay: 1,
        dailyWarmUpCount: { $cond: [{ $eq: ['$lastWarmedUpDay', todayDate] }, '$dailyWarmUpCount', 0] },
        dailyWarmConversationCount: { $cond: [{ $eq: ['$lastWarmedUpDay', todayDate] }, '$dailyWarmConversationCount', 0] },
        hasWarmedUp: 1,
        gender: 1,
        name: 1,
        createdAt: 1,
        lastIpAddress: 1,
        comment: 1,
      },
    });

    const data = await WhatsAppAuth.aggregate<InstanceItem>(pipeline);

    const buffer = excelService.export([{ sheetName: today, direction: 'rtl', headers, data }]);

    return { buffer, fileName: `instances.xlsx` };
  },

  [UPDATE_INSTANCE_COMMENT]: async (phoneNumber: string, comment: string): Promise<void> => {
    await WhatsAppAuth.updateOne({ phoneNumber }, { $set: { comment } });
  },
};
