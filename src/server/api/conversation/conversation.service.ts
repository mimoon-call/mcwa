import type { Pagination } from '@models';
import type { GetConversationRes, SearchConversationRes, GetAllConversationPairsRes } from '@server/api/conversation/conversation.types';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { GET_CONVERSATION, SEARCH_CONVERSATIONS, SEARCH_ALL_CONVERSATIONS } from '@server/api/conversation/conversation.map';
import { wa } from '@server/index';
import type { PipelineStage } from 'mongoose';

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
      { $sort: { createdAt: 1 } },
      { $project: { _id: 0, fromNumber: 1, toNumber: 1, text: 1, createdAt: 1 } },
    ]);
  },

  [SEARCH_CONVERSATIONS]: async (phoneNumber: string, page: Pagination, searchValue?: string): Promise<SearchConversationRes> => {
    const pipeline: PipelineStage[] = [
      // only messages where myNumber is involved
      { $match: { $and: [{ $or: [{ fromNumber: phoneNumber }, { toNumber: phoneNumber }] }, { internalFlag: false }] } },

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
    ];

    // Add search filter if searchValue is provided
    if (searchValue) {
      pipeline.push({
        $match: {
          $or: [
            { otherNumber: { $regex: searchValue, $options: 'i' } },
            { pushName: { $regex: searchValue, $options: 'i' } },
            { text: { $regex: searchValue, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      // sort by otherNumber and createdAt to get the most recent message per conversation
      { $sort: { otherNumber: 1, createdAt: -1 } },

      // get unique other numbers and their latest data
      {
        $group: {
          _id: '$otherNumber',
          name: { $push: { $cond: [{ $ne: ['$fromNumber', phoneNumber] }, '$pushName', null] } },
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
          messageCount: { $sum: 1 },
          internalFlag: { $first: '$internalFlag' }, // in case we want to use it later
        },
      },

      // pick the first non-null name from the array
      { $set: { name: { $first: { $filter: { input: '$name', as: 'n', cond: { $ne: ['$$n', null] } } } } } },

      // sort by most recent message first
      { $sort: { lastMessageAt: -1 } },

      // project to final format
      { $project: { _id: 0, phoneNumber: '$_id', name: 1, lastMessage: 1, lastMessageAt: 1, messageCount: 1, internalFlag: 1 } }
    );

    const data = await WhatsAppMessage.pagination<SearchConversationRes['data'][0]>({ page }, pipeline);

    const instance = wa.getInstance(phoneNumber);

    return {
      ...data,
      isConnected: instance?.connected || false,
      statusCode: instance?.get('statusCode') || null,
      errorMessage: instance?.get('errorMessage') || null,
      profilePictureUrl: instance?.get('profilePictureUrl') || null,
    };
  },

  [SEARCH_ALL_CONVERSATIONS]: async (page: Pagination, searchValue?: string): Promise<GetAllConversationPairsRes> => {
    const pipeline: PipelineStage[] = [
      // Filter out internal messages and empty text
      { $match: { $and: [{ internalFlag: false }, { text: { $ne: '' } }] } },

      // Create a normalized conversation pair key (always smaller number first)
      {
        $addFields: {
          conversationKey: {
            $cond: [
              { $lt: ['$fromNumber', '$toNumber'] },
              { $concat: ['$fromNumber', '|', '$toNumber'] },
              { $concat: ['$toNumber', '|', '$fromNumber'] },
            ],
          },
          participant1: {
            $cond: [{ $lt: ['$fromNumber', '$toNumber'] }, '$fromNumber', '$toNumber'],
          },
          participant2: {
            $cond: [{ $lt: ['$fromNumber', '$toNumber'] }, '$toNumber', '$fromNumber'],
          },
          // Get pushName from incoming messages
          pushName: { $ifNull: ['$raw.pushName', null] },
        },
      },

      // Filter out group chats (phone numbers containing '@')
      { $match: { participant1: { $not: { $regex: '@' } }, participant2: { $not: { $regex: '@' } } } },
    ];

    // Add search filter if searchValue is provided
    if (searchValue) {
      pipeline.push({
        $match: {
          $or: [
            { participant1: { $regex: searchValue, $options: 'i' } },
            { participant2: { $regex: searchValue, $options: 'i' } },
            { pushName: { $regex: searchValue, $options: 'i' } },
            { text: { $regex: searchValue, $options: 'i' } },
          ],
        },
      });
    }

    pipeline.push(
      // Lookup WhatsAppAuth to check which participants are registered
      {
        $lookup: {
          from: 'whatsappauths',
          let: { participant1: '$participant1', participant2: '$participant2' },
          pipeline: [
            { $match: { $expr: { $or: [{ $eq: ['$phoneNumber', '$$participant1'] }, { $eq: ['$phoneNumber', '$$participant2'] }] } } },
            { $project: { phoneNumber: 1 } },
          ],
          as: 'registeredParticipants',
        },
      },

      // Add field to identify which participant is not registered and get instance number
      {
        $addFields: {
          registeredPhoneNumbers: { $map: { input: '$registeredParticipants', as: 'p', in: '$$p.phoneNumber' } },
          unregisteredParticipant: {
            $switch: {
              branches: [
                {
                  case: { $not: { $in: ['$participant1', { $map: { input: '$registeredParticipants', as: 'p', in: '$$p.phoneNumber' } }] } },
                  then: '$participant1',
                },
                {
                  case: { $not: { $in: ['$participant2', { $map: { input: '$registeredParticipants', as: 'p', in: '$$p.phoneNumber' } }] } },
                  then: '$participant2',
                },
              ],
              default: '$participant1', // fallback to participant1 if both are registered (shouldn't happen)
            },
          },
          instanceNumber: {
            $let: {
              vars: {
                firstRegistered: { $first: '$registeredParticipants' },
              },
              in: { $ifNull: ['$$firstRegistered.phoneNumber', null] },
            },
          },
        },
      },

      // Sort by conversation key and createdAt to get the most recent message per conversation
      { $sort: { conversationKey: 1, createdAt: -1 } },

      // Group by conversation pair to get unique conversations
      {
        $group: {
          _id: '$conversationKey',
          participant1: { $first: '$participant1' },
          participant2: { $first: '$participant2' },
          name: { $push: { $ifNull: ['$pushName', null] } },
          unregisteredParticipant: { $first: '$unregisteredParticipant' },
          instanceNumber: { $first: '$instanceNumber' },
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
          messageCount: { $sum: 1 },
        },
      },

      // Pick the first non-null name from the array, or use unregistered participant phone number as fallback
      {
        $set: {
          name: {
            $ifNull: [
              {
                $let: {
                  vars: {
                    foundName: { $first: { $filter: { input: '$name', as: 'n', cond: { $ne: ['$$n', null] } } } },
                  },
                  in: {
                    $cond: [
                      { $and: [{ $ne: ['$$foundName', null] }, { $ne: ['$$foundName', ''] }] },
                      '$$foundName',
                      { $ifNull: ['$unregisteredParticipant', '$participant1'] },
                    ],
                  },
                },
              },
              '$unregisteredParticipant',
            ],
          },
        },
      },

      // Sort by most recent message first
      { $sort: { lastMessageAt: -1 } },

      // Project to final format
      {
        $project: {
          _id: 0,
          participant1: 1,
          participant2: 1,
          name: 1,
          lastMessage: 1,
          lastMessageAt: 1,
          messageCount: 1,
          instanceNumber: 1,
        },
      }
    );

    return WhatsAppMessage.pagination<GetAllConversationPairsRes['data'][0]>({ page }, pipeline);
  },
};
