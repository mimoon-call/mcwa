import express from 'express';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import authController from '@server/api/auth/auth.controller';
import { LOGIN, LOGOUT, REFRESH_TOKEN } from '@server/api/auth/auth.map';

const authRoute = express.Router();

authRoute.post(`/${LOGIN}`, routeMiddleware({}, authController[LOGIN]));
authRoute.post(`/${LOGOUT}`, routeMiddleware({}, authController[LOGOUT]));
authRoute.get(`/${REFRESH_TOKEN}`, routeMiddleware({}, authController[REFRESH_TOKEN]));

export default authRoute;
