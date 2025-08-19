// src/server/middleware/errors/authentication-error.ts
import type { ErrorResponseMessage } from '@server/models';
import CustomError from './custom-error';
import { ErrorCodeEnum } from './error-code.enum';
import { ErrorEnum } from './error.enum';

class AuthenticationError extends CustomError {
  errorCode = ErrorCodeEnum.UNAUTHORIZED_401;
  errorType = ErrorEnum.AUTHENTICATION_FAILED;

  constructor(
    message: string,
    private property?: string
  ) {
    super(message);

    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }

  serializeErrors(): { errorCode: number; errorType: string; errorData: undefined; errorMessage: Array<ErrorResponseMessage> } {
    return {
      errorCode: this.errorCode,
      errorType: this.errorType,
      errorData: undefined,
      errorMessage: [{ message: this.message, property: this.property }],
    };
  }
}

export default AuthenticationError;
