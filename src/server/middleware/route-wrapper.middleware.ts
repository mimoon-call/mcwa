// src/server/middleware/route-wrapper.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import type { AccessToken } from '@server/services/token/token.type';
import { CookieEnum } from '@server/constants';
import TokenService from '@server/services/token/token.service';
import logger from '@server/helpers/logger';
import AuthenticationError from '@server/middleware/errors/authentication-error';
import { ErrorEnum } from '@server/middleware/errors';
import CustomError from '@server/middleware/errors/custom-error';
import { Auth } from '@server/api/auth/auth.db';

type RouteOptions = Partial<{
  isAuthRequired: boolean;
}>;

export const routeMiddleware = (options?: RouteOptions, callback?: (...arg: any[]) => Promise<void> | void) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      delete req.headers['if-none-match'];
      delete req.headers['if-modified-since'];

      req[CookieEnum.ACCESS_TOKEN] = TokenService.decrypt<AccessToken>(req.cookies[CookieEnum.ACCESS_TOKEN]);
      req.timezone = req.header('timezone') || undefined;
      req.language = req.header('language') || undefined;

      if (options?.isAuthRequired && !req[CookieEnum.ACCESS_TOKEN]) {
        throw new AuthenticationError(ErrorEnum.AUTHENTICATION_FAILED);
      }

      if (!req[CookieEnum.ACCESS_TOKEN]) {
        res.clearCookie(CookieEnum.ACCESS_TOKEN);
      }

      if (req[CookieEnum.ACCESS_TOKEN]) {
        const { hashPassword, email } = req[CookieEnum.ACCESS_TOKEN];
        const user = await Auth.findOne({ email, hashPassword }, null, { cacheEnabledFlag: true });

        if (!user) {
          res.clearCookie(CookieEnum.ACCESS_TOKEN);
          throw new AuthenticationError(ErrorEnum.AUTHENTICATION_FAILED);
        }
      }

      if (callback) {
        return await callback(req, res, next);
      } else {
        next();
      }
    } catch (error) {
      res.set('Cache-control', 'no-store');
      logger.error(`routeWrapper:${req.originalUrl}`, { error });

      if (error instanceof CustomError) {
        const response = error.serializeErrors();
        res.status(response.errorCode).send(response);
      } else {
        res.status(400).send(error);
      }
    }
  };
};
