import type { Pagination } from '@models';
import type { GetConversationRes, SearchConversationRes } from '@server/api/conversation/conversation.types';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { GET_CONVERSATION, SEARCH_CONVERSATIONS } from '@server/api/conversation/conversation.map';

export const conversationService = {
  [GET_CONVERSATION]: async (phoneNumber: string, withPhoneNumber: string, page: Pagination): Promise<GetConversationRes> => {
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

  [SEARCH_CONVERSATIONS]: async (phoneNumber: string, page: Pagination): Promise<SearchConversationRes> => {
    return await WhatsAppMessage.pagination<SearchConversationRes['data'][0]>({ page }, [
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
};
