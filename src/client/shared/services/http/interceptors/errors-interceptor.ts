// src/client/shared/services/http/interceptors/errors-interceptor.ts
import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { AxiosResponseInterceptor } from '@services/http/http.service';
import type { ErrorResponse } from '@services/http/types';
import ServerError from '@services/http/errors/server-error';

export const errorsInterceptor: AxiosResponseInterceptor = {
  onFulfilled: (response: AxiosResponse) => {
    return response;
  },
  onRejected: async (error: AxiosError) => {
    // Handle canceled requests - don't throw error for canceled requests
    if (axios.isCancel(error)) {
      // Return a rejected promise with a serializable error object
      const cancelError = new Error('Request was canceled');
      cancelError.name = 'CanceledError';
      throw cancelError;
    }

    const err: AxiosError<ErrorResponse> = error as AxiosError<ErrorResponse>;

    // Extract error data from the response - server has already serialized the error
    const errorResponse = err.response?.data;
    if (errorResponse && errorResponse.errorMessage) {
      // Server returned structured error response - just pass it through
      // The server already called serializeErrors() and sent the proper format
      throw errorResponse;
    } else {
      // Fallback for other types of errors (network errors, etc.)
      const message = err.response?.statusText || err.message || 'An error occurred';
      throw new ServerError(message, err.response?.status);
    }
  },
};
