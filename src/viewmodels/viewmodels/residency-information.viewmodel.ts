import { ClientError } from '@bumastemra/libraries/dist/client';
import { restRequest } from '../../../../../api/rest-request';
import { AbstractViewModel, ViewModelInterface } from '../../../../../viewmodels';

export abstract class ResidencyInformationViewModel<State, RestApi = undefined> extends AbstractViewModel<State> implements ViewModelInterface<State> {
  constructor(
    initialState: State,
    private readonly restApi?: RestApi,
  ) {
    super(initialState);
  }

  protected abstract onApiPending(): void;

  protected abstract onApiError(error: ClientError): void;

  protected rest<Data>(input: {
    performRequest: (api: RestApi) => Promise<Data>;
    onSuccess: (data: Data) => void;
    onPending?: () => void;
    onError?: (error: ClientError) => void;
  }): void {
    if (!this.restApi) return;

    const { performRequest, onSuccess, onPending, onError } = input;

    this.subscribe(
      restRequest(this.restApi, {
        performRequest: (api: RestApi) => performRequest(api),
        onPending: onPending || this.onApiPending.bind(this),
        onError: onError || this.onApiError.bind(this),
        onSuccess,
      }),
    );
  }
}
