/** A volatile task cursor shared by mounts; each active run owns its callbacks. */
export function createDeferredPrewarmRunner(tasks: readonly (() => Promise<void>)[]) {
  let nextTask = 0;
  let currentRun: symbol | null = null;

  return function start({ requiresOnline = false }: { requiresOnline?: boolean } = {}): () => void {
    if (currentRun !== null || nextTask >= tasks.length) return () => {};
    const owner = Symbol();
    currentRun = owner;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    let inFlight = false;

    const ownsRun = () => currentRun === owner;
    const clearScheduled = () => {
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      idleId = null;
      timeoutId = null;
    };
    const stop = () => {
      clearScheduled();
      if (requiresOnline) window.removeEventListener("online", scheduleNext);
      if (ownsRun()) currentRun = null;
    };
    const canLoad = () => !requiresOnline || navigator.onLine !== false;
    const runNext = () => {
      idleId = null;
      timeoutId = null;
      if (!ownsRun() || !canLoad()) return;
      const task = tasks[nextTask++];
      if (!task) {
        stop();
        return;
      }
      inFlight = true;
      let pending: Promise<void>;
      try {
        pending = task();
      } catch {
        pending = Promise.resolve();
      }
      void pending
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
          // A cancelled run's late import cannot release or schedule a newer run.
          if (ownsRun()) scheduleNext();
        });
    };
    function scheduleNext() {
      if (!ownsRun()) return;
      if (nextTask >= tasks.length && !inFlight) {
        stop();
        return;
      }
      // Keep the owner and cursor while paused; the online event resumes once.
      if (!canLoad() || inFlight || idleId !== null || timeoutId !== null) return;
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(runNext, { timeout: 250 });
      } else {
        timeoutId = window.setTimeout(runNext, 250);
      }
    }

    if (requiresOnline) window.addEventListener("online", scheduleNext);
    scheduleNext();
    return stop;
  };
}
