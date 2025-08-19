import type { EntityList, Pagination } from '../../../client/shared/models';
import type { GetInstanceConversationRes, GetInstanceConversationsRes, InstanceItem } from '@server/api/instance/instance.types';
import {
  ADD_INSTANCE,
  DELETE_INSTANCE,
  GET_INSTANCE_CONVERSATION,
  GET_INSTANCE_CONVERSATIONS,
  SEARCH_INSTANCE,
} from '@server/api/instance/instance.map';
import { WhatsAppAuth, WhatsAppKey, WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { wa } from '@server/index';

export const instanceService = {
  [SEARCH_INSTANCE]: async (page: Pagination): Promise<EntityList<InstanceItem>> => {
    return await WhatsAppAuth.pagination<InstanceItem>(
      { page },
      [
        {
          $project: {
            phoneNumber: 1,
            isActive: 1,
            dailyMessageCount: 1,
            outgoingMessageCount: 1,
            incomingMessageCount: 1,
            statusCode: 1,
            errorMessage: 1,
            warmUpDay: 1,
            dailyWarmUpCount: 1,
            dailyWarmConversationCount: 1,
            hasWarmedUp: 1,
            createdAt: 1,
          },
        },
      ],
      []
    );
  },

  [GET_INSTANCE_CONVERSATION]: async (phoneNumber: string, withPhoneNumber: string): Promise<GetInstanceConversationRes['messages']> => {
    return WhatsAppMessage.find(
      {
        $or: [
          { fromNumber: phoneNumber, toNumber: withPhoneNumber },
          { fromNumber: withPhoneNumber, toNumber: phoneNumber },
        ],
      },
      { fromNumber: 1, toNumber: 1, text: 1, createdAt: 1, _id: 0 }
    )
      .sort({ createdAt: 1 }) // Sort by creation time (oldest first)
      .lean();
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
          pushName: {
            $cond: [{ $eq: ['$toNumber', phoneNumber] }, { $ifNull: ['$raw.pushName', null] }, null],
          },
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
          name: { $first: { $ifNull: ['$pushName', null] } },
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
        },
      },

      // sort by phone number
      { $sort: { _id: 1 } },

      // project to final format
      { $project: { _id: 0, phoneNumber: '$_id', name: 1, lastMessage: 1, lastMessageAt: 1 } },
    ]);
  },

  [ADD_INSTANCE]: async (phoneNumber: string): Promise<string> => {
    return await wa.addInstanceQR(phoneNumber);
  },

  [DELETE_INSTANCE]: async (phoneNumber: string): Promise<void> => {
    await WhatsAppAuth.deleteOne({ phoneNumber });
    await WhatsAppKey.deleteMany({ phoneNumber });
  },
};
