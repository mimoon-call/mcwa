// src/server/middleware/errors/internal-error.ts
import type { ErrorResponseMessage } from '@server/models';
import CustomError from './custom-error';
import { ErrorCodeEnum } from './error-code.enum';
import { ErrorEnum } from './error.enum';

class InternalError extends CustomError {
  errorCode = ErrorCodeEnum.INTERNAL_SERVER_ERROR_500;
  errorType = ErrorEnum.SERVER_ERROR;
  errorData = undefined;

  constructor(message: any = 'INTERNAL_ERROR') {
    super(message);

    Object.setPrototypeOf(this, InternalError.prototype);
  }

  serializeErrors(): { errorCode: number; errorType: string; errorData: undefined; errorMessage: ErrorResponseMessage[] } {
    return {
      errorCode: this.errorCode,
      errorType: this.errorType,
      errorData: this.errorData,
      errorMessage: [{ message: this.message }],
    };
  }
}

export default InternalError;
