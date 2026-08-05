import { ResidencyInformationRestApi, ResidencyInformationRestApiInterface } from 'rest/residency-information/residency-informat.rest-api';

import { GetEntryPayload, GetEntryResponse } from '@bumastemra/features/dist/residency-information/shared';
import { ClientError } from '@bumastemra/libraries/dist/client';
import { useViewModel, ViewModel } from '../../../../../viewmodels';
import { ResidencyInformationViewModel } from './residency-information.viewmodel';

export type ResidencyInformationViewState = {
  loading?: boolean;
  error?: ClientError | null;
  entry: GetEntryResponse | null;
};

export interface ResidencyInformationViewViewModelInterface extends ViewModel<ResidencyInformationViewState> {
  getEntry(payload: GetEntryPayload): void;
}

export class ResidencyInformationViewViewModel
  extends ResidencyInformationViewModel<ResidencyInformationViewState, ResidencyInformationRestApiInterface>
  implements ResidencyInformationViewViewModelInterface
{
  static InitialState: ResidencyInformationViewState = {
    loading: false,
    entry: null,
  };

  constructor(api: ResidencyInformationRestApiInterface) {
    super({ ...ResidencyInformationViewViewModel.InitialState }, api);
  }

  getEntry(payload: GetEntryPayload): void {
    this.rest({
      performRequest: (api) => api.getEntry(payload),
      onSuccess: (data) => {
        this.update((current) => ({
          ...current,
          entry: data,
          loading: false,
          error: null,
        }));
      },
    });
  }

  protected onApiPending(): void {
    this.update((current) => ({ ...current, entry: null, loading: true, error: undefined }));
  }

  protected onApiError(error: ClientError): void {
    this.update((current) => ({ ...current, entry: null, loading: false, error }));
  }
}

export const useResidencyInformationViewViewModel = () =>
  useViewModel<ResidencyInformationViewState, ResidencyInformationViewViewModelInterface>(
    () => new ResidencyInformationViewViewModel(ResidencyInformationRestApi),
  );
