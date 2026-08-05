import { catchError, from, map, Observable, of, tap } from 'rxjs';

import { ApiError, ApiRequest, ApiResponse, ApiResponseError } from './types';

const handleError = (error: any): Observable<ApiResponseError> => {
  if (error.error) return of({ state: 'error', error: error.error as ApiError });

  return of({
    state: 'error',
    error: {
      message: error.message,
      namespace: error.namespace || 'UNKNOWN',
      code: error.code || 'UNKNOWN',
      statusCode: Number.isNaN(error.status) ? 500 : error.status,
      context: error.context || {},
    },
  });
};

const handleResponse = <D>(data: any): ApiResponse<D> => {
  return { state: 'success', data };
};

export const restRequest = <A, R>(api: A, requestHandlers: ApiRequest<A, R>) => {
  const { performRequest, onSuccess, onPending, onError } = requestHandlers;

  return new Observable<ApiResponse<R>>((subscriber) => {
    subscriber.next({ state: 'pending' });

    return from(performRequest(api))
      .pipe(map<R, ApiResponse<R>>(handleResponse), catchError(handleError))
      .subscribe({ next: (value) => subscriber.next(value), complete: () => subscriber.complete() });
  }).pipe(
    tap((response) => {
      switch (response.state) {
        case 'pending':
          onPending();
          break;
        case 'success':
          onSuccess(response.data);
          break;
        case 'error':
          onError(response.error);
          break;

        default:
          break;
      }
    }),
  );
};
