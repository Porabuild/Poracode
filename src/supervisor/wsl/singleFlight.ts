/**
 * Caller-refcounted single-flight.
 *
 * One task per key runs at a time; every caller after the first joins it.
 * Each caller owns its own abort signal, and cancelling one caller only
 * rejects that caller's wait. The shared task is cancelled only when every
 * joined caller has gone away, so an aborted caller cannot sabotage a
 * concurrent one that still wants the result.
 *
 * A task that cannot observe the cancellation may outlive its last caller
 * (an extraction leg without a cancellation channel, for example). The
 * aborted flight stays in the map until its task actually settles, and a
 * successor waits for that settlement before running its own task, so "one
 * task per key" holds even for uncooperative work.
 */

interface Flight {
  refs: number;
  finished: boolean;
  controller: AbortController;
  promise: Promise<unknown>;
}

export interface SingleFlightOptions {
  signal?: AbortSignal;
}

export class SingleFlight {
  private readonly flights = new Map<string, Flight>();

  get size(): number {
    return this.flights.size;
  }

  run<T>(
    key: string,
    task: (signal: AbortSignal) => Promise<T>,
    options?: SingleFlightOptions,
  ): Promise<T> {
    const signal = options?.signal;
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new Error(`single-flight wait "${key}" cancelled`));
    }
    let flight = this.flights.get(key);
    // A flight whose last caller left is already aborted. Its task may still
    // be running uncooperatively, so preserve custody: wait for the actual
    // settlement (the flight stays in the map until then), and only afterwards
    // run a successor task under this caller's own signal.
    if (flight?.controller.signal.aborted) {
      return this.runAfterSettlement(flight, key, task, options);
    }
    if (!flight) {
      const controller = new AbortController();
      const created: Flight = {
        refs: 0,
        finished: false,
        controller,
        promise: Promise.resolve(),
      };
      created.promise = task(controller.signal).finally(() => {
        created.finished = true;
        if (this.flights.get(key) === created) this.flights.delete(key);
      });
      // A flight whose last caller went away must not surface as unhandled.
      void created.promise.catch(() => undefined);
      this.flights.set(key, created);
      flight = created;
    }

    const joined = flight;
    joined.refs += 1;

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const release = (): void => {
        joined.refs -= 1;
        if (joined.refs === 0 && !joined.finished) {
          joined.controller.abort(new Error(`single-flight task "${key}" cancelled`));
        }
      };
      const finish = (): boolean => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        return true;
      };
      const onAbort = (): void => {
        if (!finish()) return;
        release();
        reject(signal?.reason ?? new Error(`single-flight wait "${key}" cancelled`));
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      joined.promise.then(
        (value) => {
          if (!finish()) return;
          release();
          resolve(value as T);
        },
        (error: unknown) => {
          if (!finish()) return;
          release();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  /**
   * Wait for an aborted flight's task to settle, then run a fresh task.
   * `run` is re-entered, so an already-aborted successor signal rejects
   * without starting anything, and concurrent successors converge on the one
   * task the first of them creates.
   */
  private runAfterSettlement<T>(
    predecessor: Flight,
    key: string,
    task: (signal: AbortSignal) => Promise<T>,
    options: SingleFlightOptions | undefined,
  ): Promise<T> {
    const successor = predecessor.promise
      .catch(() => undefined)
      .then(() => this.run(key, task, options));
    const signal = options?.signal;
    if (!signal) return successor;
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void =>
        reject(signal.reason ?? new Error(`single-flight wait "${key}" cancelled`));
      signal.addEventListener("abort", onAbort, { once: true });
      successor.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}
