import { ResidencyInformationRestApi, ResidencyInformationRestApiInterface } from 'rest/residency-information/residency-informat.rest-api';

import { CreateEntryPayload } from '@bumastemra/features/dist/residency-information/shared';
import { ClientError } from '@bumastemra/libraries/dist/client';
import { useViewModel, ViewModel } from '../../../../../viewmodels';
import { ResidencyInformationViewModel } from './residency-information.viewmodel';

export type ResidencyInformationCreateState = {
  loading?: boolean;
  error?: ClientError | null;
  entryId: string | null;
};

export interface ResidencyInformationCreateViewModelInterface extends ViewModel<ResidencyInformationCreateState> {
  create(input: CreateEntryPayload): void;
}

export class ResidencyInformationCreateViewModel
  extends ResidencyInformationViewModel<ResidencyInformationCreateState, ResidencyInformationRestApiInterface>
  implements ResidencyInformationCreateViewModelInterface
{
  static InitialState: ResidencyInformationCreateState = {
    loading: false,
    entryId: null,
    error: null,
  };

  constructor(api: ResidencyInformationRestApiInterface) {
    super({ ...ResidencyInformationCreateViewModel.InitialState }, api);
  }

  create(input: CreateEntryPayload): void {
    this.rest({
      performRequest: (api) => api.createEntry(input),
      onSuccess: (data) => {
        this.update((current) => ({
          ...current,
          entryId: data.entryId,
          loading: false,
          error: null,
        }));
      },
    });
  }

  protected onApiPending(): void {
    this.update((current) => ({ ...current, entryId: null, loading: true, error: undefined }));
  }

  protected onApiError(error: ClientError): void {
    this.update((current) => ({ ...current, entryId: null, loading: false, error }));
  }
}

export const useResidencyInformationCreateViewModel = () =>
  useViewModel<ResidencyInformationCreateState, ResidencyInformationCreateViewModelInterface>(
    () => new ResidencyInformationCreateViewModel(ResidencyInformationRestApi),
  );
