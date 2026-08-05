import { BehaviorSubject, Observable, Subscription } from 'rxjs';

export interface ViewModel<T> {
  state: Omit<BehaviorSubject<T>, 'next'>;
  initialize(): void;
  dispose(): void;
}

export abstract class AbstractViewModel<T> implements ViewModel<T> {
  state: BehaviorSubject<T>;

  private subscription: Subscription;

  protected constructor(initialState: T) {
    this.state = new BehaviorSubject(initialState);
    this.subscription = new Subscription();

    if (import.meta.env.VITE_DEPLOY_ENV === 'dev') {
      (window as any).currentViewModel = this;
    }
  }

  initialize() {
    this.subscription = new Subscription();
  }

  update(block: (current: T) => T) {
    this.state.next(block(this.state.getValue()));
  }

  subscribe<O>(observable: Observable<O>) {
    this.subscription.add(observable.subscribe());
  }

  dispose(): void {
    this.subscription.unsubscribe();
  }
}
