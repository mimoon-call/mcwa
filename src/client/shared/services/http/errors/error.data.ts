import type { ErrorResponseMessage } from '@services/http/types';

export type ErrorData =
  | {
      messages: Array<ErrorResponseMessage> | ErrorResponseMessage;
      code?: number;
      type?: string;
      data?: any;
    }
  | string;
