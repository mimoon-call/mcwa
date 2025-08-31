import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import { ADD_MESSAGE_QUEUE, REMOVE_MESSAGE_QUEUE, SEARCH_MESSAGE_QUEUE, SEND_ACTIVE } from '@server/api/message-queue/message-queue.map';
import { messageQueueController } from '@server/api/message-queue/message-queue.controller';

const messageQueueRoute = express.Router();

messageQueueRoute.post(`/${SEARCH_MESSAGE_QUEUE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[SEARCH_MESSAGE_QUEUE]));
messageQueueRoute.post(`/${ADD_MESSAGE_QUEUE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[ADD_MESSAGE_QUEUE]));
messageQueueRoute.post(`/${SEND_ACTIVE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[SEND_ACTIVE]));

messageQueueRoute.delete(
  `/${REMOVE_MESSAGE_QUEUE}/:queueId`,
  routeMiddleware({ isAuthRequired: true }, messageQueueController[REMOVE_MESSAGE_QUEUE])
);

export default messageQueueRoute;
