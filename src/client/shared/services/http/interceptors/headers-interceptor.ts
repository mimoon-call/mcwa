// src/client/shared/services/http/interceptors/headers-interceptor.ts
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { AxiosRequestInterceptor } from '@services/http/http.service';
import i18n from '@client/locale/i18n';

export const headersInterceptor: AxiosRequestInterceptor = {
  onFulfilled: (request: InternalAxiosRequestConfig) => {
    (request.headers || {}).timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Get current language from i18next
    const currentLanguage = i18n.language || 'en';
    (request.headers || {}).language = currentLanguage;

    return request;
  },
  onRejected: (error: AxiosError) => Promise.reject(error),
};
