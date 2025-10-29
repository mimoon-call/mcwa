import type { Pagination } from '@models';
import {
  GetConversationRes,
  SearchConversationRes,
  SearchAllConversationsRes,
  ConversationPairItem,
  DeleteConversationRes,
  GetConversationItem,
} from '@server/api/conversation/conversation.types';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { WhatsappQueue } from '@server/api/message-queue/whatsapp.queue';
import {
  GET_CONVERSATION,
  SEARCH_CONVERSATIONS,
  SEARCH_ADS_CONVERSATIONS,
  SEND_MESSAGE,
  DELETE_CONVERSATION,
  AI_REASONING_CONVERSATION,
  REVOKE_MESSAGE,
  ADD_TO_CRM,
} from '@server/api/conversation/conversation.map';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';
import { wa, app } from '@server/index';
import type { PipelineStage } from 'mongoose';
import { BaseResponse } from '@server/models';
import { conversationAiHandler, LeadWebhookPayload } from '@server/api/message-queue/helpers/conversation-ai.handler';
import ServerError from '@services/http/errors/server-error';
import NotFoundError from '@services/http/errors/not-found-error';
import { ErrorCodeEnum } from '@services/http/errors/error-code.enum';
import { HttpService } from '@services/http/http.service';
import logger from '@server/helpers/logger';

export const conversationService = {
  [GET_CONVERSATION]: async (phoneNumber: string, withPhoneNumber: string, page: Pagination): Promise<GetConversationRes> => {
    const { pageSize = 50, ...restPage } = page || {};

    return await WhatsAppMessage.pagination<GetConversationItem>({ page: { pageSize, ...restPage } }, [
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
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 0,
          fromNumber: 1,
          toNumber: 1,
          text: 1,
          createdAt: 1,
          sentAt: 1,
          deliveredAt: 1,
          playedAt: 1,
          status: 1,
          messageId: 1,
          tempId: { $cond: [{ $eq: ['$status', 'ERROR'] }, '$messageId', null] },
        },
      },
    ]);
  },

  [SEARCH_CONVERSATIONS]: async (
    phoneNumber: string,
    page: Pagination,
    searchValue?: string,
    externalFlag?: boolean
  ): Promise<SearchConversationRes> => {
    const pipeline: PipelineStage[] = [
      // only messages where myNumber is involved
      {
        $match: {
          $and: [
            { $or: [{ fromNumber: phoneNumber }, { toNumber: phoneNumber }] },
            { text: { $ne: '' } },
            { text: { $ne: null } },
            ...(externalFlag === true ? [{ internalFlag: false }] : []),
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
          internalFlag: { $first: '$internalFlag' },
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

  [SEARCH_ADS_CONVERSATIONS]: async (
    page: Pagination,
    searchValue?: string,
    intents?: string[],
    departments?: string[],
    interested?: boolean
  ): Promise<SearchAllConversationsRes> => {
    const pipeline: PipelineStage[] = [
      // Filter out queue items that don't have instance numbers or are empty
      {
        $match: {
          $and: [
            { instanceNumber: { $exists: true, $nin: [null, ''] } },
            { phoneNumber: { $exists: true, $nin: [null, ''] } },
            { textMessage: { $ne: '' } },
            // Filter out group chats (phone numbers containing '@')
            { phoneNumber: { $not: { $regex: '@' } } },
          ],
        },
      },

      // Create a normalized conversation key
      {
        $addFields: {
          conversationKey: { $concat: ['$phoneNumber', '|', '$instanceNumber'] },
        },
      },
    ];

    pipeline.push(
      // Sort by conversation key and createdAt to get the most recent message per conversation
      { $sort: { conversationKey: 1, createdAt: -1 } },

      // Group by conversation pair to get unique conversations
      {
        $group: {
          _id: '$conversationKey',
          name: { $first: { $ifNull: ['$fullName', '$phoneNumber'] } },
          phoneNumber: { $first: '$phoneNumber' },
          instanceNumber: { $first: '$instanceNumber' },
          textMessage: { $first: '$textMessage' }, // Keep the queue message text as fallback
          lastMessageAt: { $first: '$createdAt' },
          messageCount: { $sum: 1 },
          // Get AI classification data from the most recent queue message
          action: { $first: '$action' },
          confidence: { $first: '$confidence' },
          intent: { $first: '$intent' },
          department: { $first: '$department' },
          interested: { $first: '$interested' },
          reason: { $first: '$reason' },
          followUpAt: { $first: '$followUpAt' },
          messageId: { $first: '$messageId' },
          webhookErrorMessage: { $first: '$webhookErrorMessage' },
          webhookSuccessFlag: { $first: '$webhookSuccessFlag' },
        },
      }
    );

    // Add search filter if searchValue is provided - search across entire conversation history
    if (searchValue) {
      pipeline.push(
        // Lookup all messages for this conversation pair
        {
          $lookup: {
            from: 'whatsappmessages',
            let: { phoneNum: '$phoneNumber', instanceNum: '$instanceNumber' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $or: [
                          { $and: [{ $eq: ['$fromNumber', '$$phoneNum'] }, { $eq: ['$toNumber', '$$instanceNum'] }] },
                          { $and: [{ $eq: ['$fromNumber', '$$instanceNum'] }, { $eq: ['$toNumber', '$$phoneNum'] }] },
                        ],
                      },
                      { $ne: ['$text', ''] },
                      { $ne: ['$text', null] },
                    ],
                  },
                },
              },
              {
                $match: {
                  text: { $regex: searchValue, $options: 'i' },
                },
              },
              { $limit: 1 },
            ],
            as: 'matchingMessages',
          },
        },
        // Filter to only include conversations with matching messages or matching phoneNumber/name
        {
          $match: {
            $or: [
              { phoneNumber: { $regex: searchValue, $options: 'i' } },
              { name: { $regex: searchValue, $options: 'i' } },
              { 'matchingMessages.0': { $exists: true } },
            ],
          },
        },
        // Remove the temporary array
        { $project: { matchingMessages: 0 } }
      );
    }

    pipeline.push(
      // Lookup WhatsAppMessage to get the last received message and pushName (fromNumber is the user, toNumber is the instance)
      {
        $lookup: {
          from: 'whatsappmessages',
          let: { phoneNum: '$phoneNumber', instanceNum: '$instanceNumber' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$fromNumber', '$$phoneNum'] },
                    { $eq: ['$toNumber', '$$instanceNum'] },
                    { $ne: ['$text', ''] },
                    { $ne: ['$text', null] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $project: { text: 1, createdAt: 1, 'raw.pushName': 1 } },
          ],
          as: 'lastReceivedMessage',
        },
      },

      // Add lastMessage and pushName fields from the lookup result
      // If no received message exists, fall back to the queue message
      {
        $addFields: {
          lastMessage: {
            $cond: [{ $gt: [{ $size: '$lastReceivedMessage' }, 0] }, { $arrayElemAt: ['$lastReceivedMessage.text', 0] }, '$textMessage'],
          },
          pushName: { $arrayElemAt: ['$lastReceivedMessage.raw.pushName', 0] },
          // Update name to use pushName if available, otherwise fall back to phoneNumber
          name: {
            $cond: [
              { $ne: [{ $arrayElemAt: ['$lastReceivedMessage.raw.pushName', 0] }, null] },
              { $arrayElemAt: ['$lastReceivedMessage.raw.pushName', 0] },
              '$name',
            ],
          },
          // Ensure lastMessageAt always has a value - prefer received message, fall back to existing lastMessageAt
          lastMessageAt: {
            $ifNull: [
              { $cond: [{ $gt: [{ $size: '$lastReceivedMessage' }, 0] }, { $arrayElemAt: ['$lastReceivedMessage.createdAt', 0] }, null] },
              '$lastMessageAt'
            ],
          },
        },
      },

      // Remove the temporary array
      { $project: { lastReceivedMessage: 0 } },

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
          action: 1,
          confidence: 1,
          intent: 1,
          department: 1,
          interested: 1,
          reason: 1,
          followUpAt: 1,
          webhookErrorMessage: 1,
          webhookSuccessFlag: 1,
          hasStartMessage: { $cond: [{ $and: [{ $ne: ['$messageId', null] }, { $ne: ['$messageId', ''] }] }, true, false] },
        },
      },

      // Lookup unsubscribed status from whatsappunsubscribes collection
      {
        $lookup: {
          from: 'whatsappunsubscribes',
          localField: 'phoneNumber',
          foreignField: 'phoneNumber',
          pipeline: [{ $project: { createdAt: 1 } }],
          as: 'unsubscribedData',
        },
      },

      // Add unsubscribedAt field
      {
        $addFields: {
          unsubscribedAt: { $arrayElemAt: ['$unsubscribedData.createdAt', 0] },
        },
      },

      // Remove the temporary array
      { $project: { unsubscribedData: 0 } }
    );

    // Add filter conditions for intents, departments, and interested
    const filterConditions: Record<string, unknown>[] = [];
    const orConditions: Record<string, unknown>[] = [];

    if (intents && intents.length > 0) orConditions.push({ intent: { $in: intents } });
    if (departments && departments.length > 0) filterConditions.push({ department: { $in: departments } });
    if (interested === true) orConditions.push({ interested: true });

    // Add OR condition for intents or interested
    if (orConditions.length > 0) filterConditions.push({ $or: orConditions });

    if (filterConditions.length > 0) pipeline.push({ $match: { $and: filterConditions } });

    const { data, ...rest } = await WhatsappQueue.pagination<ConversationPairItem>({ page }, pipeline);

    return {
      data: data.map((value) => {
        const instance = value.instanceNumber ? wa.getInstance(value.instanceNumber) : null;

        return { ...value, instanceConnected: instance?.connected || false };
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

    const result = await instance.send(toNumber, { type: 'text', text: textMessage }, { trackDelivery: true });

    // Broadcast new message event
    const messageData = {
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

  [REVOKE_MESSAGE]: async (docIdOrMessageId: string): Promise<BaseResponse> => {
    try {
      const message = await WhatsAppMessage.findOne({ $or: [{ _id: docIdOrMessageId }, { messageId: docIdOrMessageId }] });
      if (!message?.raw?.key) return { returnCode: 1 };

      const instance = wa.getInstance(message.fromNumber);
      if (!instance) throw new NotFoundError('INSTANCE.NOT_FOUND');
      if (!instance.connected) throw new ServerError('INSTANCE.NOT_CONNECTED', ErrorCodeEnum.BAD_REQUEST_400);

      await instance.relay(message.toNumber, message.raw.key);
      return { returnCode: 0 };
    } catch {
      throw new ServerError('INSTANCE.REVOKE_FAILED', ErrorCodeEnum.BAD_REQUEST_400);
    }
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
    const queueDeleteResult = await WhatsappQueue.deleteMany({
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

  [AI_REASONING_CONVERSATION]: async (phoneNumber: string, withPhoneNumber: string): Promise<BaseResponse> => {
    const lastMessage = await WhatsAppMessage.findOne({
      $or: [
        { fromNumber: phoneNumber, toNumber: withPhoneNumber },
        { fromNumber: withPhoneNumber, toNumber: phoneNumber },
      ],
      text: { $ne: '' },
    }).sort({ createdAt: -1 });

    if (!lastMessage) {
      return { returnCode: 1 };
    }

    await conversationAiHandler(lastMessage._id, { debounceTime: 0, sendAutoReplyFlag: false, callWebhookFlag: false, instanceNumber: phoneNumber });

    return { returnCode: 0 };
  },

  [ADD_TO_CRM]: async (phoneNumber: string, withPhoneNumber: string): Promise<BaseResponse<LeadWebhookPayload>> => {
    const webhookRequest = (() => {
      const url = process.env.LEAD_WEBHOOK_URL as undefined | `https://${string}`;
      if (!url) throw new ServerError('No webhook URL configured');

      const api = new HttpService({ baseURL: url, timeout: 30 * 1000, headers: { 'Content-type': 'application/json; charset=UTF-8' } });

      return (payload: LeadWebhookPayload) => api.post<void, LeadWebhookPayload>('', payload, { signatureKey: process.env.WEBHOOK_SECRET });
    })();

    const message = await WhatsappQueue.aggregate<LeadWebhookPayload>([
      { $match: { $and: [{ instanceNumber: phoneNumber, phoneNumber: withPhoneNumber }, { sentAt: { $exists: true } }] } },
      { $sort: { sentAt: 1 } },
      { $limit: 1 },
      {
        $project: {
          messageId: 1,
          metaTemplateId: { $ifNull: ['$metaTemplateId', null] },
          initiatorMessageId: { $ifNull: ['$initiatorMessageId', null] },
          department: 1,
        },
      },
      {
        $lookup: {
          let: { msgId: '$messageId' },
          from: 'whatsappmessages',
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$messageId', '$$msgId'] }, { $eq: ['$fromNumber', phoneNumber] }, { $eq: ['$toNumber', withPhoneNumber] }],
                },
              },
            },
            { $project: { _id: 0, internalFlag: 0, warmingFlag: 0, raw: 0 } },
          ],
          as: 'replayMessage',
        },
      },
      {
        $replaceRoot: {
          newRoot: { $mergeObjects: [{ $arrayElemAt: ['$replayMessage', 0] }, { $unsetField: { field: 'replayMessage', input: '$$ROOT' } }] },
        },
      },
      { $project: { __v: 0 } },
    ]);

    if (message[0]?.interested === undefined || !webhookRequest) throw new ServerError('No message found or webhook not configured');

    logger.debug('addToCrm:payload', { ...message[0], interested: true });

    const messageId = message[0].messageId;

    try {
      await webhookRequest({ ...message[0], interested: true });
      WhatsappQueue.updateOne({ messageId }, { $set: { webhookSuccessFlag: true, webhookErrorMessage: null } }).catch((err) =>
        logger.error('Failed to update webhook success flag', err)
      );
    } catch (error: unknown) {
      WhatsappQueue.updateOne({ messageId }, { $set: { webhookSuccessFlag: false, webhookErrorMessage: String(error) } }).catch((err) =>
        logger.error('Failed to update webhook error flag', err)
      );

      throw error;
    }

    return { returnCode: 0, ...message[0] };
  },
};
