import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import {
  ADD_INSTANCE,
  DELETE_INSTANCE,
  GET_INSTANCE_CONVERSATION,
  GET_INSTANCE_CONVERSATIONS,
  SEARCH_INSTANCE,
} from '@server/api/instance/instance.map';
import { instanceController } from '@server/api/instance/instance.controller';

const instanceRoute = express.Router();

instanceRoute.post(`/${SEARCH_INSTANCE}`, routeMiddleware({ isAuthRequired: true }, instanceController[SEARCH_INSTANCE]));

instanceRoute.post(
  `/${GET_INSTANCE_CONVERSATIONS}/:phoneNumber`,
  routeMiddleware({ isAuthRequired: true }, instanceController[GET_INSTANCE_CONVERSATIONS])
);

instanceRoute.post(
  `/${GET_INSTANCE_CONVERSATION}/:phoneNumber`,
  routeMiddleware({ isAuthRequired: true }, instanceController[GET_INSTANCE_CONVERSATION])
);

instanceRoute.get(`/${ADD_INSTANCE}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, instanceController[ADD_INSTANCE]));
instanceRoute.delete(`/${DELETE_INSTANCE}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, instanceController[DELETE_INSTANCE]));
export default instanceRoute;
