import type { ErrorResponseMessage } from '@services/http/types';

abstract class CustomError extends Error {
  abstract errorCode: number;

  protected constructor(message: any) {
    super(message);

    Object.setPrototypeOf(this, CustomError.prototype);
  }

  abstract serializeErrors(): {
    errorCode: number;
    errorData: Record<string, any> | undefined;
    errorMessage: Array<ErrorResponseMessage>;
  };
}

export default CustomError;
