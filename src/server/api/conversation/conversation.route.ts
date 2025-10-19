import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import { conversationController } from '@server/api/conversation/conversation.controller';
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

const conversationRoute = express.Router();

conversationRoute.post(
  `/${SEARCH_CONVERSATIONS}/:phoneNumber`,
  routeMiddleware({ isAuthRequired: true }, conversationController[SEARCH_CONVERSATIONS])
);
conversationRoute.post(
  `/${GET_CONVERSATION}/:phoneNumber/:withPhoneNumber`,
  routeMiddleware({ isAuthRequired: true }, conversationController[GET_CONVERSATION])
);

conversationRoute.post(`/${SEARCH_ADS_CONVERSATIONS}`, routeMiddleware({ isAuthRequired: true }, conversationController[SEARCH_ADS_CONVERSATIONS]));

conversationRoute.post(`/${SEND_MESSAGE}/:fromNumber/:toNumber`, routeMiddleware({ isAuthRequired: true }, conversationController[SEND_MESSAGE]));

conversationRoute.delete(
  `/${DELETE_CONVERSATION}/:fromNumber/:toNumber`,
  routeMiddleware({ isAuthRequired: true }, conversationController[DELETE_CONVERSATION])
);

conversationRoute.post(
  `/${AI_REASONING_CONVERSATION}/:phoneNumber/:withPhoneNumber`,
  routeMiddleware({ isAuthRequired: true }, conversationController[AI_REASONING_CONVERSATION])
);

conversationRoute.post(`/${ADD_TO_CRM}/:phoneNumber/:withPhoneNumber`, routeMiddleware({ isAuthRequired: true }, conversationController[ADD_TO_CRM]));

conversationRoute.post(`/${REVOKE_MESSAGE}/:docIdOrMessageId`, routeMiddleware({ isAuthRequired: true }, conversationController[REVOKE_MESSAGE]));

export default conversationRoute;
