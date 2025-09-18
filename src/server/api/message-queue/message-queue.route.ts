import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import {
  ADD_MESSAGE_QUEUE,
  CLEAR_MESSAGE_QUEUE,
  EDIT_MESSAGE_QUEUE,
  REMOVE_MESSAGE_QUEUE,
  RESUBSCRIBE_NUMBER,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
  UNSUBSCRIBE_NUMBER,
} from '@server/api/message-queue/message-queue.map';
import { messageQueueController } from '@server/api/message-queue/message-queue.controller';

const messageQueueRoute = express.Router();

messageQueueRoute.post(`/${SEARCH_MESSAGE_QUEUE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[SEARCH_MESSAGE_QUEUE]));
messageQueueRoute.post(`/${ADD_MESSAGE_QUEUE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[ADD_MESSAGE_QUEUE]));
messageQueueRoute.post(`/${EDIT_MESSAGE_QUEUE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[EDIT_MESSAGE_QUEUE]));
messageQueueRoute.post(`/${START_QUEUE_SEND}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[START_QUEUE_SEND]));
messageQueueRoute.post(`/${STOP_QUEUE_SEND}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[STOP_QUEUE_SEND]));
messageQueueRoute.post(`/${RESUBSCRIBE_NUMBER}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, messageQueueController[RESUBSCRIBE_NUMBER]));
messageQueueRoute.post(`/${UNSUBSCRIBE_NUMBER}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, messageQueueController[UNSUBSCRIBE_NUMBER]));

messageQueueRoute.delete(
  `/${REMOVE_MESSAGE_QUEUE}/:queueId`,
  routeMiddleware({ isAuthRequired: true }, messageQueueController[REMOVE_MESSAGE_QUEUE])
);

messageQueueRoute.delete(`/${CLEAR_MESSAGE_QUEUE}`, routeMiddleware({ isAuthRequired: true }, messageQueueController[CLEAR_MESSAGE_QUEUE]));

export default messageQueueRoute;
