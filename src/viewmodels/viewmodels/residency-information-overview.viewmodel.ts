import { ResidencyInformationRestApi, ResidencyInformationRestApiInterface } from 'rest/residency-information/residency-informat.rest-api';

import { GetAllForRelationResponse } from '@bumastemra/features/dist/residency-information/shared';
import { ClientError } from '@bumastemra/libraries/dist/client';
import { useViewModel, ViewModel } from '../../../../../viewmodels';
import { ResidencyInformationViewModel } from './residency-information.viewmodel';

export type ResidencyInformationOverviewState = {
  loading?: boolean;
  error?: ClientError | null;
  entries: GetAllForRelationResponse;
};

export interface ResidencyInformationOverviewViewModelInterface extends ViewModel<ResidencyInformationOverviewState> {
  getAllForRelation(): void;
}

export class ResidencyInformationOverviewViewModel
  extends ResidencyInformationViewModel<ResidencyInformationOverviewState, ResidencyInformationRestApiInterface>
  implements ResidencyInformationOverviewViewModelInterface
{
  static InitialState: ResidencyInformationOverviewState = {
    loading: false,
    entries: [],
  };

  constructor(api: ResidencyInformationRestApiInterface) {
    super({ ...ResidencyInformationOverviewViewModel.InitialState }, api);
  }

  getAllForRelation(): void {
    this.rest({
      performRequest: (api) => api.getAllForRelation(),
      onSuccess: (data) => {
        this.update((current) => ({
          ...current,
          entries: data,
          loading: false,
          error: null,
        }));
      },
    });
  }

  protected onApiPending(): void {
    this.update((current) => ({ ...current, entries: [], loading: true, error: undefined }));
  }

  protected onApiError(error: ClientError): void {
    this.update((current) => ({ ...current, entries: [], loading: false, error }));
  }
}

export const useResidencyInformationOverviewViewModel = () =>
  useViewModel<ResidencyInformationOverviewState, ResidencyInformationOverviewViewModelInterface>(
    () => new ResidencyInformationOverviewViewModel(ResidencyInformationRestApi),
  );
