import { ClientError } from '@bumastemra/libraries/dist/client';

export type ApiError = ClientError;

export type ApiResponseError = {
  state: 'error';
  error: ApiError;
};

export type ApiResponse<Ok> =
  | {
      state: 'pending';
    }
  | {
      state: 'success';
      data: Ok;
    }
  | ApiResponseError;

export type ApiRequest<A, T> = {
  performRequest: (api: A) => Promise<T>;
  onPending: () => void;
  onSuccess: (data: T) => void;
  onError: (error: ApiError) => void;
};
