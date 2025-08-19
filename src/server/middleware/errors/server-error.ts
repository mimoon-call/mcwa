// src/server/middleware/errors/server-error.ts
import type { ErrorResponseMessage } from '@server/models';
import type { ErrorData } from './error.data';
import CustomError from './custom-error';
import { ErrorCodeEnum } from './error-code.enum';
import { ErrorEnum } from './error.enum';

class ServerError extends CustomError {
  errorCode = ErrorCodeEnum.BAD_REQUEST_400;
  errorType = ErrorEnum.BAD_REQUEST;

  constructor(
    private data: ErrorData,
    private code?: number
  ) {
    super(data);

    Object.setPrototypeOf(this, ServerError.prototype);
  }

  serializeErrors(): {
    errorCode: number;
    errorType: string;
    errorData: Record<string, unknown> | undefined;
    errorMessage: Array<ErrorResponseMessage>;
  } {
    if (typeof this.data === 'string') {
      return {
        errorCode: this.code || this.errorCode,
        errorType: this.errorType,
        errorData: undefined,
        errorMessage: [{ message: this.data }],
      };
    }

    const { messages, code, type, data } = this.data;

    return {
      errorCode: this.code || code || this.errorCode,
      errorType: type || this.errorType,
      errorData: data || undefined,
      errorMessage: Array.isArray(messages) ? messages : [messages],
    };
  }
}

export default ServerError;
