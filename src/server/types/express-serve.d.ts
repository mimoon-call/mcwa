// src/server/types/express-serve.d.ts
import crypto from 'crypto';
import { CookieEnum } from '@server/constants';
import type { AccessToken } from '@server/services/token/token.type';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: crypto.BinaryLike;
    language?: string;
    timezone?: string;
    [CookieEnum.ACCESS_TOKEN]?: AccessToken;
  }
}
