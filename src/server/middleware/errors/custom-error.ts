// src/server/middleware/errors/custom-error.ts
import type { ErrorResponseMessage } from '@server/models';

abstract class CustomError extends Error {
  abstract errorCode: number;

  protected constructor(message: any) {
    super(message);

    Object.setPrototypeOf(this, CustomError.prototype);
  }

  abstract serializeErrors(): {
    errorCode: number;
    errorData: Record<string, any> | undefined;
    errorMessage: ErrorResponseMessage[];
  };
}

export default CustomError;
