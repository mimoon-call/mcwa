import type { ErrorResponseMessage } from '@services/http/types';
import CustomError from './custom-error';
import { ErrorCodeEnum } from './error-code.enum';
import { ErrorEnum } from './error.enum';

class NotFoundError extends CustomError {
  errorCode = ErrorCodeEnum.NOT_FOUND_404;
  errorType = ErrorEnum.NOT_FOUND;
  errorData = undefined;

  constructor(
    message: string,
    private redirectTo?: ErrorResponseMessage['redirectTo']
  ) {
    super(message);

    Object.setPrototypeOf(this, NotFoundError.prototype);
  }

  serializeErrors(): { errorCode: number; errorType: string; errorData: undefined; errorMessage: Array<ErrorResponseMessage> } {
    return {
      errorCode: this.errorCode,
      errorType: this.errorType,
      errorData: this.errorData,
      errorMessage: [{ message: this.message, redirectTo: this.redirectTo }],
    };
  }
}

export default NotFoundError;
