// src/server/middleware/errors/error.data.ts
import type { ErrorResponseMessage } from '@server/models';

export type ErrorData =
  | {
      messages: ErrorResponseMessage[] | ErrorResponseMessage;
      code?: number;
      type?: string;
      data?: any;
    }
  | string;
