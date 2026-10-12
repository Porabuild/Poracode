import { create } from "zustand";

/** Visible, transient feedback for host work. Never persisted across restart. */
export const useRendererActionStore = create<{ pending: Readonly<Record<string, boolean>> }>(
  () => ({ pending: {} }),
);
const jobs = new Map<string, Promise<unknown>>();

/** Claim synchronously, and join repeat clicks until the original operation settles. */
export function runRendererAction<T>(
  key: string,
  action: () => Promise<T>,
  options: { queue?: boolean } = {},
): Promise<T> {
  const existing = jobs.get(key);
  if (existing && !options.queue) return existing as Promise<T>;
  useRendererActionStore.setState((state) => ({ pending: { ...state.pending, [key]: true } }));
  let accept!: (value: T | PromiseLike<T>) => void;
  let refuse!: (error: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    accept = resolve;
    refuse = reject;
  });
  const job = result.finally(() => {
    if (jobs.get(key) !== job) return;
    jobs.delete(key);
    useRendererActionStore.setState((state) => {
      const { [key]: _finished, ...pending } = state.pending;
      return { pending };
    });
  });
  jobs.set(key, job);
  try {
    accept(existing ? existing.catch(() => {}).then(action) : action());
  } catch (error) {
    refuse(error);
  }
  return job;
}
