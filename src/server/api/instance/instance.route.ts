import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import { ACTIVE_TOGGLE_INSTANCE, ADD_INSTANCE, DELETE_INSTANCE, INSTANCE_REFRESH, SEARCH_INSTANCE, WARMUP_TOGGLE } from '@server/api/instance/instance.map';
import { instanceController } from '@server/api/instance/instance.controller';

const instanceRoute = express.Router();

instanceRoute.post(`/${SEARCH_INSTANCE}`, routeMiddleware({ isAuthRequired: true }, instanceController[SEARCH_INSTANCE]));

instanceRoute.get(`/${ADD_INSTANCE}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, instanceController[ADD_INSTANCE]));
instanceRoute.delete(`/${DELETE_INSTANCE}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, instanceController[DELETE_INSTANCE]));

instanceRoute.post(`/${ACTIVE_TOGGLE_INSTANCE}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, instanceController[ACTIVE_TOGGLE_INSTANCE]));
instanceRoute.post(`/${INSTANCE_REFRESH}/:phoneNumber`, routeMiddleware({ isAuthRequired: true }, instanceController[INSTANCE_REFRESH]));
instanceRoute.post(`/${WARMUP_TOGGLE}`, routeMiddleware({ isAuthRequired: true }, instanceController[WARMUP_TOGGLE]));

export default instanceRoute;
