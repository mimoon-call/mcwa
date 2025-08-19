// src/client/shared/services/http/http.service.ts
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios';

import crypto from 'crypto';

export type AxiosRequestInterceptor = {
  onFulfilled: (value: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
  onRejected: (error: AxiosError) => AxiosError | Promise<AxiosError>;
};

export type AxiosResponseInterceptor = {
  onFulfilled: (value: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
  onRejected: (error: AxiosError) => AxiosError | Promise<AxiosError> | Promise<unknown>;
};

type ApiServiceConfig = Partial<{
  noCache?: boolean;
  allowOnceAtTime?: boolean;
  uniqueUrl?: boolean;
}>;

type AxiosGetRequestConfig = AxiosRequestConfig & ApiServiceConfig;
type AxiosPostRequestConfig = AxiosRequestConfig & Omit<ApiServiceConfig, 'noCache'>;

type Config = {
  requestInterceptors?: Array<AxiosRequestInterceptor>;
  responseInterceptors?: Array<AxiosResponseInterceptor>;
  baseURL?: CreateAxiosDefaults['baseURL'];
  timeout?: CreateAxiosDefaults['timeout'];
  headers?: Record<string, string>;
};

export class HttpService {
  private api: AxiosInstance;
  private apiConfig: CreateAxiosDefaults;
  private requestControllers = new Map<string, AbortController>();

  constructor(config: Config) {
    const { requestInterceptors = [], responseInterceptors = [], ...rest } = config;
    this.apiConfig = { withCredentials: true, ...rest };
    this.api = axios.create(this.apiConfig);

    this.registerRequestInterceptors(requestInterceptors);
    this.registerResponseInterceptors(responseInterceptors);
  }

  private registerRequestInterceptors(interceptors: Array<AxiosRequestInterceptor>): void {
    for (const interceptor of interceptors) {
      this.api.interceptors.request.use(
        (value: InternalAxiosRequestConfig) => interceptor.onFulfilled(value),
        (error: AxiosError) => interceptor.onRejected(error)
      );
    }
  }

  private registerResponseInterceptors(interceptors: Array<AxiosResponseInterceptor>): void {
    for (const interceptor of interceptors) {
      this.api.interceptors.response.use(
        (value: AxiosResponse) => interceptor.onFulfilled(value),
        (error: AxiosError) => interceptor.onRejected(error)
      );
    }
  }

  private makeRequest<T>(request: () => Promise<AxiosResponse<T>>, key?: string): Promise<T> {
    return request()
      .then(({ data }) => data)
      .finally(() => {
        if (key) {
          this.requestControllers.delete(key);
        }
      });
  }

  private signalKey(value: string): string {
    let hash = 0;

    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
    }

    return (hash >>> 0).toString(16);
  }

  private signalCancel(key: string): void {
    const controller = this.requestControllers.get(key);
    if (controller) {
      controller.abort();
      this.requestControllers.delete(key);
    }
  }

  private getAbortSignal(value: string, allowOnceAtTime?: boolean): AbortSignal {
    const key = this.signalKey(value);

    if (allowOnceAtTime) {
      this.signalCancel(key);
    }

    const abortController = new AbortController();
    this.requestControllers.set(key, abortController);
    return abortController.signal;
  }

  private getSignatureOfValue(value: unknown, signatureKey: string) {
    return crypto.createHmac('sha256', signatureKey).update(JSON.stringify(value)).digest('hex');
  }

  async get<Response>(url: string, config?: AxiosGetRequestConfig): Promise<Response> {
    const { noCache, allowOnceAtTime, uniqueUrl = true, ...rest } = config || {};

    const axiosConfig: AxiosRequestConfig = {
      signal: this.getAbortSignal(uniqueUrl ? url : url.split('?')[0], allowOnceAtTime),
      ...rest,
      headers: { ...(rest.headers || {}), ...(noCache ? { 'Cache-Control': 'no-cache' } : {}) },
    };

    return this.makeRequest(() => this.api.get<Response>(url, axiosConfig));
  }

  async post<Response, Payload = never>(url: string, data?: Payload, config?: AxiosPostRequestConfig & { signatureKey?: string }): Promise<Response> {
    const { allowOnceAtTime, uniqueUrl = false, signatureKey, headers = {}, ...rest } = config || {};

    if (data instanceof FormData) {
      headers['Content-type'] = 'multipart/form-data';
    }

    if (signatureKey) {
      headers['X-Signature'] = this.getSignatureOfValue(data, signatureKey);
    }

    const axiosConfig: AxiosRequestConfig = {
      signal: this.getAbortSignal(JSON.stringify(uniqueUrl ? [url, data] : url), allowOnceAtTime),
      headers,
      ...rest,
    };

    return this.makeRequest(() => this.api.post<Response>(url, data, axiosConfig));
  }

  async put<Response, Payload>(url: string, data: Payload, config?: AxiosRequestConfig): Promise<Response> {
    return this.makeRequest(() => this.api.put<Response>(url, data, config));
  }

  async patch<Response, Payload = never>(url: string, data: Payload, config?: AxiosRequestConfig): Promise<Response> {
    return this.makeRequest(() => this.api.patch<Response>(url, data, config));
  }

  async delete<Response>(url: string, config?: AxiosRequestConfig): Promise<Response> {
    return this.makeRequest(() => this.api.delete<Response>(url, config));
  }
}
