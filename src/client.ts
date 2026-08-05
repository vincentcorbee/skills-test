import Z from 'zod';

import { STATUS_CODES } from './constants';
import { ClientError, ClientResponse, RequestAuthorization, RequestPayload, RequestValidator, ResponseValidator } from './types';

export abstract class Client {
  constructor(private readonly baseUrl: string) {}

  protected async request<T>(
    payload: RequestPayload,
    validators: { requestValidator?: RequestValidator<RequestPayload['body']>; responseValidator?: ResponseValidator<T> } = {},
  ): Promise<ClientResponse<T>> {
    const { endpoint, ...rest } = payload;
    const { requestValidator, responseValidator } = validators;

    try {
      const error = this.validateData(payload.body, requestValidator);

      if (error) return { ok: false, error };

      const response = await fetch(this.getUrl(endpoint), this.getRequestInit(rest));

      return this.handleResponse<T>(response, responseValidator);
    } catch (error) {
      return { ok: false, error: error as ClientError };
    }
  }

  protected validateRequestData<T>(data: T, validator?: RequestValidator<T>): ClientResponse<null> {
    const error = this.validateData(data, validator);

    if (error) return { ok: false, error };

    return { ok: true, data: null };
  }

  private validateData<T>(data: T, validator?: RequestValidator<T>): ClientError | null {
    if (validator instanceof Z.Schema) {
      const result = this.validateSchema(data, validator);

      if (result) return result;
    }

    return null;
  }

  private validateSchema<T>(data: T, schema: Z.Schema<T>): ClientError | null {
    const result = schema.safeParse(data);

    if (result.error)
      return {
        message: 'Validation error',
        namespace: 'CLIENT',
        code: 'VALIDATION_ERROR',
        context: result.error,
      };

    return null;
  }

  private getUrl(endpoint: RequestPayload['endpoint']): string {
    return `${this.baseUrl}/${endpoint}`;
  }

  private getHeaders(headers: Record<string, string> = {}, authorization: RequestAuthorization = {}): HeadersInit {
    const augmentedHeaders: Record<string, string> = { ...headers };

    for (const [key, value] of Object.entries(authorization)) augmentedHeaders[key] = value;

    return augmentedHeaders;
  }

  private getRequestInit(args: Omit<RequestPayload, 'endpoint'> = {}): RequestInit {
    const { headers, authorization, body, method, ...rest } = args;

    return {
      headers: this.getHeaders(headers, authorization),
      method: method ?? 'GET',
      body,
      ...rest,
    };
  }

  private getResponseType(response: Response) {
    const ContentTypeHeader = response.headers.get('content-type');

    if (ContentTypeHeader && ContentTypeHeader.includes('application/json')) return 'json';

    return 'text';
  }

  private getResponseBody(response: Response): Promise<any> {
    const responseType = this.getResponseType(response);

    switch (responseType) {
      case 'json':
        return response.json();
      default:
        return response.text();
    }
  }

  private handleException(status: number, body: any): ClientError {
    const code = body?.code || STATUS_CODES[status];

    return {
      message: body?.message || body || 'Unknown error',
      namespace: body?.namespace || 'UNKNONW',
      code,
      statusCode: body?.statusCode || status,
      context: body?.context || {},
    };
  }

  private async handleResponse<T>(response: Response, validator?: ResponseValidator<T>): Promise<ClientResponse<T>> {
    const { status, ok } = response;

    const body = await this.getResponseBody(response);

    if (!ok) return { ok, error: this.handleException(status, body) };

    const error = this.validateData(body, validator);

    if (error) return { ok: false, error };

    return { ok, data: body };
  }
}
