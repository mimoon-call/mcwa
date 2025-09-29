import { HttpService } from '@services/http/http.service';
import { headersInterceptor } from '@services/http/interceptors/headers-interceptor';
import { errorsInterceptor } from '@services/http/interceptors/errors-interceptor';
import { removeReturnCodeInterceptor } from '@services/http/interceptors/remove-return-code-interceptor';

export class ApiService extends HttpService {
  constructor(baseUrl?: `/${string}` | `http://${string}` | `https://${string}`) {
    super({
      baseURL: '/api' + (baseUrl || '') + '/',
      timeout: 30 * 1000, // 30 seconds
      headers: { 'Content-type': 'application/json; charset=UTF-8' },
      requestInterceptors: [headersInterceptor],
      responseInterceptors: [errorsInterceptor, removeReturnCodeInterceptor],
    });
  }
}

export default new ApiService();
