import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import { conversationController } from '@server/api/conversation/conversation.controller';
import { GET_CONVERSATION, SEARCH_CONVERSATIONS, SEARCH_ALL_CONVERSATIONS } from '@server/api/conversation/conversation.map';

const conversationRoute = express.Router();

conversationRoute.post(
  `/${SEARCH_CONVERSATIONS}/:phoneNumber`,
  routeMiddleware({ isAuthRequired: true }, conversationController[SEARCH_CONVERSATIONS])
);
conversationRoute.post(`/${GET_CONVERSATION}/:phoneNumber/:withPhoneNumber?`, routeMiddleware({ isAuthRequired: true }, conversationController[GET_CONVERSATION]));

conversationRoute.post(`/${SEARCH_ALL_CONVERSATIONS}`, routeMiddleware({ isAuthRequired: true }, conversationController[SEARCH_ALL_CONVERSATIONS]));

export default conversationRoute;
