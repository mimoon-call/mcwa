// src/client/shared/services/http/index.ts
import { HttpService } from './http.service';
import { headersInterceptor } from './interceptors/headers-interceptor';
import { errorsInterceptor } from './interceptors/errors-interceptor';
import { removeReturnCodeInterceptor } from './interceptors/remove-return-code-interceptor';

const TIMEOUT = 30 * 1000; // 30 seconds

export const Http = new HttpService({
  baseURL: '/api',
  timeout: TIMEOUT,
  headers: { 'Content-type': 'application/json; charset=UTF-8' },
  requestInterceptors: [headersInterceptor],
  responseInterceptors: [errorsInterceptor, removeReturnCodeInterceptor],
});
