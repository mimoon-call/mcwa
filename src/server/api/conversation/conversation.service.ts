import type { Pagination } from '@models';
import {
  GetConversationRes,
  SearchConversationRes,
  GetAllConversationPairsRes,
  ConversationPairItem,
  DeleteConversationRes,
} from '@server/api/conversation/conversation.types';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { MessageQueueDb } from '@server/api/message-queue/message-queue.db';
import {
  GET_CONVERSATION,
  SEARCH_CONVERSATIONS,
  SEARCH_ALL_CONVERSATIONS,
  SEND_MESSAGE,
  DELETE_CONVERSATION,
} from '@server/api/conversation/conversation.map';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { wa, app } from '@server/index';
import type { PipelineStage } from 'mongoose';
import { BaseResponse } from '@server/models';

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
            { $and: [{ text: { $ne: '' } }, { text: { $ne: null } }] },
          ],
        },
      },
      { $sort: { createdAt: 1 } },
      { $project: { _id: 0, fromNumber: 1, toNumber: 1, text: 1, createdAt: 1, sentAt: 1, deliveredAt: 1, playedAt: 1, status: 1, messageId: 1 } },
    ]);
  },

  [SEARCH_CONVERSATIONS]: async (phoneNumber: string, page: Pagination, searchValue?: string): Promise<SearchConversationRes> => {
    const pipeline: PipelineStage[] = [
      // only messages where myNumber is involved
      {
        $match: {
          $and: [
            { $or: [{ fromNumber: phoneNumber }, { toNumber: phoneNumber }] },
            { internalFlag: false },
            { text: { $ne: '' } },
            { text: { $ne: null } },
          ],
        },
      },

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
      { $match: { $and: [{ internalFlag: false }, { text: { $ne: '' } }, { text: { $ne: null } }] } },

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
            $let: { vars: { firstRegistered: { $first: '$registeredParticipants' } }, in: { $ifNull: ['$$firstRegistered.phoneNumber', null] } },
          },
        },
      },

      // Sort by conversation key and createdAt to get the most recent message per conversation
      { $sort: { conversationKey: 1, createdAt: -1 } },

      // Group by conversation pair to get unique conversations
      {
        $group: {
          _id: '$conversationKey',
          name: { $push: { $ifNull: ['$pushName', null] } },
          unregisteredParticipant: { $first: '$unregisteredParticipant' },
          phoneNumber: { $first: '$unregisteredParticipant' },
          instanceNumber: { $first: '$instanceNumber' },
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
          messageCount: { $sum: 1 },
        },
      },

      { $match: { instanceNumber: { $exists: true } } },

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
          name: 1,
          lastMessage: 1,
          lastMessageAt: 1,
          messageCount: 1,
          instanceNumber: 1,
          phoneNumber: 1,
        },
      }
    );

    const afterPipeline: PipelineStage[] = [
      // Lookup the last messageId from whatsappqueues collection for this conversation
      {
        $lookup: {
          from: 'whatsappqueues',
          let: { phoneNumber: '$phoneNumber', instanceNumber: '$instanceNumber' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$phoneNumber', '$$phoneNumber'] },
                    { $eq: ['$instanceNumber', '$$instanceNumber'] },
                    { $ne: ['$messageId', null] },
                    { $ne: ['$messageId', ''] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $project: { messageId: 1 } },
          ],
          as: 'lastQueueMessage',
        },
      },

      // Lookup the corresponding message from whatsappmessages collection
      {
        $lookup: {
          from: 'whatsappmessages',
          let: {
            phoneNumber: '$phoneNumber',
            instanceNumber: '$instanceNumber',
            lastMessageId: { $arrayElemAt: ['$lastQueueMessage.messageId', 0] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$fromNumber', '$$instanceNumber'] },
                    { $eq: ['$toNumber', '$$phoneNumber'] },
                    { $eq: ['$messageId', '$$lastMessageId'] },
                  ],
                },
              },
            },
            { $project: { action: 1, confidence: 1, department: 1, interested: 1, reason: 1, intent: 1 } },
          ],
          as: 'messageDetails',
        },
      },

      // Lookup unsubscribed status from whatsappunsubscribes collection
      {
        $lookup: {
          from: 'whatsappunsubscribes',
          let: { phoneNumber: '$phoneNumber' },
          pipeline: [{ $match: { $expr: { $eq: ['$phoneNumber', '$$phoneNumber'] } } }, { $project: { createdAt: 1 } }],
          as: 'unsubscribedData',
        },
      },

      // Merge the fields from the message details
      {
        $addFields: {
          action: { $arrayElemAt: ['$messageDetails.action', 0] },
          confidence: { $arrayElemAt: ['$messageDetails.confidence', 0] },
          intent: { $arrayElemAt: ['$messageDetails.intent', 0] },
          department: { $arrayElemAt: ['$messageDetails.department', 0] },
          interested: { $arrayElemAt: ['$messageDetails.interested', 0] },
          reason: { $arrayElemAt: ['$messageDetails.reason', 0] },
          unsubscribedAt: { $arrayElemAt: ['$unsubscribedData.createdAt', 0] },
        },
      },

      // Remove the temporary arrays
      { $project: { lastQueueMessage: 0, messageDetails: 0, unsubscribedData: 0 } },
    ];

    const { data, ...rest } = await WhatsAppMessage.pagination<ConversationPairItem>({ page }, pipeline, afterPipeline);

    return {
      data: data.map((value) => {
        const instance = value.instanceNumber ? wa.getInstance(value.instanceNumber) : null;

        return {
          ...value,
          instanceConnected: instance?.connected || false,
        };
      }),
      ...rest,
    };
  },

  [SEND_MESSAGE]: async (fromNumber: string, toNumber: string, textMessage: string): Promise<BaseResponse> => {
    const instance = wa.getInstance(fromNumber);

    if (!instance) {
      return { returnCode: 1 };
    }

    if (!instance.connected) {
      return { returnCode: 1 };
    }

    if (instance.get('isActive') === false) {
      return { returnCode: 1 };
    }

    const result = await instance.send(toNumber, { type: 'text', text: textMessage });

    // Broadcast new message event
    const messageData = {
      fromNumber: result.fromNumber,
      toNumber: result.toNumber,
      text: textMessage,
      createdAt: result.sentAt,
      status: result.status,
      sentAt: result.sentAt,
      deliveredAt: result.deliveredAt,
      playedAt: result.playedAt,
      messageId: result.messageId,
    };

    // Send message to specific conversation room instead of broadcasting
    const conversationKey = `conversation:${fromNumber}:${toNumber}`;
    app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_MESSAGE, messageData);

    const message = await WhatsAppMessage.findOne({ fromNumber, toNumber, messageId: result.messageId });

    if (message) {
      // Send conversation update to specific conversation room
      const conversationData = {
        name: message.raw?.pushName || toNumber,
        phoneNumber: toNumber,
        instanceNumber: fromNumber,
        lastMessage: message.text || '',
        lastMessageAt: message.createdAt,
        messageCount: 1,
        action: message.action || '',
        confidence: message.confidence || 0,
        department: message.department || '',
        interested: message.interested || false,
        reason: message.reason || '',
        instanceConnected: true,
      };

      app.socket.sendToRoom(conversationKey, ConversationEventEnum.NEW_CONVERSATION, conversationData);
    }

    return { returnCode: 0 };
  },

  [DELETE_CONVERSATION]: async (fromNumber: string, toNumber: string): Promise<DeleteConversationRes> => {
    // Delete messages from WhatsAppMessage collection
    // Delete messages where fromNumber/toNumber match either direction
    const messageDeleteResult = await WhatsAppMessage.deleteMany({
      $or: [
        { fromNumber: fromNumber, toNumber: toNumber },
        { fromNumber: toNumber, toNumber: fromNumber },
      ],
    });

    // Delete messages from WhatsAppQueue collection
    // Delete messages where instanceNumber matches either fromNumber or toNumber
    // and phoneNumber matches the other participant
    const queueDeleteResult = await MessageQueueDb.deleteMany({
      $or: [
        { instanceNumber: fromNumber, phoneNumber: toNumber },
        { instanceNumber: toNumber, phoneNumber: fromNumber },
      ],
    });

    const deletedMessagesCount = messageDeleteResult.deletedCount || 0;
    const deletedQueueCount = queueDeleteResult.deletedCount || 0;

    return {
      returnCode: 0,
      deletedMessagesCount,
      deletedQueueCount,
    };
  },
};
