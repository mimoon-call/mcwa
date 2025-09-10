import type { EntityList, Pagination } from '@models';
import type { GetInstanceConversationRes, GetInstanceConversationsRes, InstanceItem, SearchInstanceReq } from '@server/api/instance/instance.types';
import {
  ACTIVE_TOGGLE_INSTANCE,
  ADD_INSTANCE,
  DELETE_INSTANCE,
  GET_INSTANCE_CONVERSATION,
  GET_INSTANCE_CONVERSATIONS,
  INSTANCE_REFRESH,
  SEARCH_INSTANCE,
} from '@server/api/instance/instance.map';
import { WhatsAppAuth, WhatsAppKey, WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { wa } from '@server/index';
import ServerError from '@server/middleware/errors/server-error';

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

    pipeline.push({
      $project: {
        phoneNumber: 1,
        isActive: 1,
        profilePictureUrl: 1,
        dailyMessageCount: 1,
        outgoingErrorCount: 1,
        outgoingMessageCount: 1,
        incomingMessageCount: 1,
        statusCode: 1,
        errorMessage: 1,
        warmUpDay: 1,
        dailyWarmUpCount: { $cond: [{ $eq: ['$lastWarmedUpDay', today] }, '$dailyWarmUpCount', 0] },
        dailyWarmConversationCount: { $cond: [{ $eq: ['$lastWarmedUpDay', today] }, '$dailyWarmConversationCount', 0] },
        hasWarmedUp: 1,
        gender: 1,
        name: 1,
        createdAt: 1,
        lastIpAddress: 1,
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

  [GET_INSTANCE_CONVERSATION]: async (phoneNumber: string, withPhoneNumber: string, page: Pagination): Promise<GetInstanceConversationRes> => {
    const { pageSize = 50, ...restPage } = page || {};

    return WhatsAppMessage.pagination({ page: { pageSize, ...restPage } }, [
      {
        $match: {
          $and: [
            {
              $or: [
                { fromNumber: phoneNumber, toNumber: withPhoneNumber },
                { fromNumber: withPhoneNumber, toNumber: phoneNumber },
              ],
            },
            { text: { $ne: '' } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $project: { _id: 0, fromNumber: 1, toNumber: 1, text: 1, createdAt: 1 } },
    ]);
  },

  [GET_INSTANCE_CONVERSATIONS]: async (phoneNumber: string, page: Pagination): Promise<GetInstanceConversationsRes> => {
    return await WhatsAppMessage.pagination<GetInstanceConversationsRes['data'][0]>({ page }, [
      // only messages where myNumber is involved
      { $match: { $or: [{ fromNumber: phoneNumber }, { toNumber: phoneNumber }] } },

      // extract the other participant per message and pushName if available
      {
        $addFields: {
          otherNumber: { $cond: [{ $eq: ['$fromNumber', phoneNumber] }, '$toNumber', '$fromNumber'] },
          // Get pushName from incoming messages (when phoneNumber is toNumber)
          pushName: { $cond: [{ $eq: ['$toNumber', phoneNumber] }, { $ifNull: ['$raw.pushName', null] }, null] },
        },
      },

      // exclude self-chats just in case
      { $match: { otherNumber: { $ne: phoneNumber } } },

      // filter out group chats (phone numbers containing '@')
      { $match: { otherNumber: { $not: { $regex: '@' } } } },

      // sort by otherNumber and createdAt to get the most recent message per conversation
      { $sort: { otherNumber: 1, createdAt: -1 } },

      // get unique other numbers and their latest data
      {
        $group: {
          _id: '$otherNumber',
          name: { $push: { $cond: [{ $ne: ['$fromNumber', phoneNumber] }, '$pushName', null] } },
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
        },
      },

      // pick the first non-null name from the array
      { $set: { name: { $first: { $filter: { input: '$name', as: 'n', cond: { $ne: ['$$n', null] } } } } } },

      // sort by most recent message first
      { $sort: { lastMessageAt: -1 } },

      // project to final format
      { $project: { _id: 0, phoneNumber: '$_id', name: 1, lastMessage: 1, lastMessageAt: 1 } },
    ]);
  },

  [ADD_INSTANCE]: async (phoneNumber: string): Promise<string> => {
    const instance = wa.getInstance(phoneNumber);
    await instance?.disable();

    return await wa.addInstanceQR(phoneNumber);
  },

  [DELETE_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    const instance = wa.getInstance(phoneNumber);

    await instance?.remove(true);
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

    await instance.refresh();
  },
};
