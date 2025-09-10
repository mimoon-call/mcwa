// src/client/shared/services/http/interceptors/errors-interceptor.ts
import axios, { type AxiosError, type AxiosResponse } from 'axios';
import type { AxiosResponseInterceptor } from '@services/http/http.service';
import type { ErrorResponse } from '@services/http/types';
import ServerError from '@services/http/server-error';

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
    const serverError = new ServerError(err);

    throw serverError;
  },
};
