import z from 'zod';

export type ClientError = ReturnType<BackendException['toJSON']>;
export type ClientResponseError = {
  ok: false;
  error: ClientError;
};

export type ClientResponse<Data> =
  | {
      ok: true;
      data: Data;
    }
  | ClientResponseError;

export type RequestAuthorization = Record<string, string>

export type RequestPayload = Partial<Pick<RequestInit, 'body' | 'method'> & { headers: Record<string, string> }> & {
  endpoint: string;
  authorization?: RequestAuthorization;
};

export type ResponseValidator<T> = z.Schema<T> | z.Effect<T>;
export type RequestValidator<T> = z.Schema<T> | z.Effect<T>;
