import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { exitCouldNotBeConfirmed } from "../../runtime/spawn";

/** Process-local custody for the probe and install work shared by one supervisor. */
export class NativeRuntimeWork {
  readonly controller = new AbortController();
  private readonly work = new AsyncWorkTracker();
  private retirementFailure: Error | undefined;
  private joined = false;
  private stopping: Promise<void> | undefined;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get retired(): boolean {
    return this.joined;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    this.signal.throwIfAborted();
    return this.work.run(async () => {
      try {
        return await work();
      } catch (error) {
        if (exitCouldNotBeConfirmed(error)) this.retirementFailure ??= error;
        throw error;
      }
    });
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.controller.abort(new DOMException("Native runtime work stopped", "AbortError"));
    this.stopping = this.work.drain().then(() => {
      if (this.retirementFailure) throw this.retirementFailure;
      this.joined = true;
    });
    return this.stopping;
  }
}

const workByBaseDir = new Map<string, NativeRuntimeWork>();

export function nativeRuntimeWork(baseDir: string): NativeRuntimeWork {
  let work = workByBaseDir.get(baseDir);
  if (!work) {
    work = new NativeRuntimeWork();
    workByBaseDir.set(baseDir, work);
  }
  return work;
}

/** A later supervisor may start only after the previous owner's stop has joined. */
export async function stopNativeRuntimeWork(baseDir: string): Promise<void> {
  await workByBaseDir.get(baseDir)?.stop();
}

export function startNativeRuntimeWork(baseDir: string): boolean {
  const previous = workByBaseDir.get(baseDir);
  if (!previous?.signal.aborted) return false;
  if (!previous.retired) throw new Error("Previous native runtime work has not retired");
  workByBaseDir.set(baseDir, new NativeRuntimeWork());
  return true;
}

export function resetNativeRuntimeWorkForTests(): void {
  for (const work of workByBaseDir.values()) void work.stop().catch(() => {});
  workByBaseDir.clear();
}
