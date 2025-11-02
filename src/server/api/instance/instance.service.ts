import type { EntityList, Pagination } from '@models';
import { ExportInstancesToExcelReq, InstanceItem, SearchInstanceReq } from '@server/api/instance/instance.types';
import {
  ACTIVE_TOGGLE_INSTANCE,
  ADD_INSTANCE,
  DELETE_INSTANCE,
  EXPORT_INSTANCES_TO_EXCEL,
  INSTANCE_REFRESH,
  RELOAD_INSTANCES,
  RESET_INSTANCE,
  SEARCH_INSTANCE,
  UPDATE_INSTANCE_COMMENT,
  WARMUP_TOGGLE,
  WARMUP_TOGGLE_INSTANCE,
} from '@server/api/instance/instance.map';
import { WhatsAppAuth, WhatsAppKey, WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { WhatsappQueue } from '@server/api/message-queue/whatsapp.queue';
import { wa } from '@server/index';
import ServerError from '@server/middleware/errors/server-error';
import ExcelService from '@server/services/excel/excel.service';
import getLocalTime from '@server/helpers/get-local-time';

const getInstance = async (phoneNumber: string) => {
  const instance = wa.getInstance(phoneNumber);

  if (!instance) {
    if (!(await WhatsAppAuth.findOne({ phoneNumber }))) {
      throw new ServerError('INSTANCE.NOT_FOUND');
    } else {
      throw new ServerError('INSTANCE.NOT_READY');
    }
  }

  return instance;
};

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

    // Start a MongoDB session for transaction
    const session = await WhatsAppAuth.startSession();

    try {
      // Perform all database operations in a transaction
      await session.withTransaction(async () => {
        // Delete instance auth and keys
        await WhatsAppAuth.deleteOne({ phoneNumber }, { session });
        await WhatsAppKey.deleteMany({ phoneNumber }, { session });

        // Delete messages from queue related to this instance
        await WhatsappQueue.deleteMany({ instanceNumber: phoneNumber }, { session });

        // Delete all messages where this instance is either sender or receiver
        await WhatsAppMessage.deleteMany({ $or: [{ fromNumber: phoneNumber }, { toNumber: phoneNumber }] }, { session });
      });

      // Only after successful transaction, disconnect and remove the instance
      await instance?.disconnect({ clearSocket: true, logout: true }, 'Deleting instance');
      await instance?.remove();
    } finally {
      await session.endSession();
    }
  },

  [ACTIVE_TOGGLE_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    const instance = await getInstance(phoneNumber);

    const isActive = !!instance.get('isActive');
    if (isActive) {
      await instance.disable();
    } else {
      await instance.enable();
    }
  },

  [WARMUP_TOGGLE_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    const instance = await getInstance(phoneNumber);
    const hasWarmedUp = !!instance.get('hasWarmedUp');
    await instance.update({ hasWarmedUp: !hasWarmedUp, ...(!hasWarmedUp ? { isActive: true } : {}) });
  },

  [INSTANCE_REFRESH]: async (phoneNumber: string): Promise<void> => {
    const instance = await getInstance(phoneNumber);
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

  [RESET_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    const instance = await getInstance(phoneNumber);
    await instance.update({ incomingMessageCount: 0, outgoingMessageCount: 0, outgoingErrorCount: 0 });
  },

  [RELOAD_INSTANCES]: async (): Promise<void> => {
    await wa.reloadInstances();
  },
};
