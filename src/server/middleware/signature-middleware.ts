// webhook.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ErrorCodeEnum } from '@server/middleware/errors/error-code.enum';
import CustomError from '@server/middleware/errors/custom-error';
import ServerError from '@server/middleware/errors/server-error';

/**
 * Middleware to verify webhook HMAC signature
 */

const getSignatureOfValue = (value: unknown, signatureKey: string) =>
  crypto.createHmac('sha256', signatureKey).update(JSON.stringify(value)).digest('hex');

export function signatureMiddleware(signatureKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-signature'];

      if (!signature || typeof signature !== 'string') {
        throw new ServerError('Missing or invalid signature header', ErrorCodeEnum.BAD_REQUEST_400);
      }

      if (signature !== getSignatureOfValue(req.body, signatureKey)) {
        throw new ServerError('Invalid signature', ErrorCodeEnum.FORBIDDEN_403);
      }

      next();
    } catch (error) {
      res.set('Cache-control', 'no-store');

      if (error instanceof CustomError) {
        const response = error.serializeErrors();

        return res.status(response.errorCode).send(response);
      } else {
        return res.status(400).send(error);
      }
    }
  };
}
