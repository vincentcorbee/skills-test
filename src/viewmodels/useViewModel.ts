import { useEffect, useState } from 'react';

import { ViewModel } from './viewmodel';

export function useViewModel<T, V extends ViewModel<T>>(initializer: () => V): [T, Omit<V, 'state'>] {
  const [viewModel] = useState(initializer);
  const [state, setState] = useState(viewModel.state.getValue());

  useEffect(() => {
    viewModel.initialize();
    const subscription = viewModel.state.subscribe(setState);
    return () => {
      subscription.unsubscribe();
      viewModel.dispose();
    };
  }, [viewModel, viewModel.state]);

  return [state, viewModel];
}
