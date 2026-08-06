export interface RemoteRefreshOptions {
  readonly refreshSelectedThread?: boolean;
  readonly resetLastSeenSeq?: boolean;
  readonly includeAuxiliary?: boolean;
  /** Queue a new snapshot when an older request is already in flight. */
  readonly trailingIfInFlight?: boolean;
}

interface NormalizedRefreshOptions {
  readonly refreshSelectedThread: boolean;
  readonly resetLastSeenSeq: boolean;
  readonly includeAuxiliary: boolean;
}

interface PendingRefresh<Result> {
  options: NormalizedRefreshOptions;
  run: (options: RemoteRefreshOptions) => Promise<Result>;
  readonly promise: Promise<Result>;
  readonly resolve: (result: Result) => void;
  readonly reject: (error: unknown) => void;
}

interface RefreshState<Result> {
  options: NormalizedRefreshOptions;
  promise: Promise<Result>;
  pending: PendingRefresh<Result> | null;
}

function normalize(options: RemoteRefreshOptions): NormalizedRefreshOptions {
  return {
    refreshSelectedThread: options.refreshSelectedThread === true,
    resetLastSeenSeq: options.resetLastSeenSeq === true,
    includeAuxiliary: options.includeAuxiliary ?? true,
  };
}

function covers(current: NormalizedRefreshOptions, requested: NormalizedRefreshOptions): boolean {
  return (
    (!requested.refreshSelectedThread || current.refreshSelectedThread) &&
    (!requested.resetLastSeenSeq || current.resetLastSeenSeq) &&
    (!requested.includeAuxiliary || current.includeAuxiliary)
  );
}

function merge(
  left: NormalizedRefreshOptions,
  right: NormalizedRefreshOptions,
): NormalizedRefreshOptions {
  return {
    refreshSelectedThread: left.refreshSelectedThread || right.refreshSelectedThread,
    resetLastSeenSeq: left.resetLastSeenSeq || right.resetLastSeenSeq,
    includeAuxiliary: left.includeAuxiliary || right.includeAuxiliary,
  };
}

/** Coalesces equivalent refreshes and permits at most one stronger trailing run. */
export class RemoteRefreshScheduler<Result> {
  private readonly states = new Map<string, RefreshState<Result>>();

  request(
    identity: string,
    options: RemoteRefreshOptions,
    run: (options: RemoteRefreshOptions) => Promise<Result>,
  ): Promise<Result> {
    const requested = normalize(options);
    const state = this.states.get(identity);
    if (!state) return this.start(identity, requested, run);
    if (state.pending) {
      state.pending.options = merge(state.pending.options, requested);
      state.pending.run = run;
      return state.pending.promise;
    }
    if (options.trailingIfInFlight !== true && covers(state.options, requested)) {
      return state.promise;
    }

    let resolve!: (result: Result) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Result>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    state.pending = { options: requested, run, promise, resolve, reject };
    return promise;
  }

  private start(
    identity: string,
    options: NormalizedRefreshOptions,
    run: (options: RemoteRefreshOptions) => Promise<Result>,
  ): Promise<Result> {
    const promise = run(options);
    const state: RefreshState<Result> = { options, promise, pending: null };
    this.states.set(identity, state);
    const settle = () => {
      if (this.states.get(identity) !== state) return;
      const pending = state.pending;
      if (!pending) {
        this.states.delete(identity);
        return;
      }
      const trailing = this.start(identity, pending.options, pending.run);
      trailing.then(pending.resolve, pending.reject);
    };
    void promise.then(settle, settle);
    return promise;
  }
}
