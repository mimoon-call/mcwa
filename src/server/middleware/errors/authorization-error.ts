// src/server/middleware/errors/authorization-error.ts
import type { ErrorResponseMessage } from '@server/models';
import CustomError from './custom-error';
import { ErrorCodeEnum } from './error-code.enum';
import { ErrorEnum } from './error.enum';

class AuthorizationError extends CustomError {
  errorCode = ErrorCodeEnum.FORBIDDEN_403;
  errorType = ErrorEnum.AUTHORIZATION_FAILED;

  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }

  serializeErrors(): { errorCode: number; errorType: string; errorData: undefined; errorMessage: ErrorResponseMessage[] } {
    return {
      errorCode: this.errorCode,
      errorType: this.errorType,
      errorData: undefined,
      errorMessage: [{ message: this.message }],
    };
  }
}

export default AuthorizationError;
