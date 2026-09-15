import {
  execFile,
  type ChildProcess,
  type ExecFileException,
  type ExecFileOptionsWithStringEncoding,
} from "node:child_process";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { ChildProcessLifetime, type ChildProcessStopOptions } from "@/shared/childProcessLifetime";
import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";

export interface NativeProcessOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export type NativeProcessRun = (
  command: string,
  args: string[],
  options?: NativeProcessOptions,
) => Promise<{ stdout: string; stderr: string }>;

type LaunchProcess = (
  command: string,
  args: string[],
  options: ExecFileOptionsWithStringEncoding,
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
) => ChildProcess;

/** Per-driver ownership of short-lived native commands, including their pipes. */
export class NativeProcessRunner {
  private readonly work = new AsyncWorkTracker();
  private readonly children = new Set<ChildProcessLifetime>();
  private closed = false;
  private closing: Promise<void> | undefined;

  constructor(
    private readonly options: {
      launch?: LaunchProcess;
      stopOptions?: ChildProcessStopOptions;
    } = {},
  ) {}

  run(
    command: string,
    args: string[],
    options: NativeProcessOptions & { signal: AbortSignal },
  ): Promise<{ stdout: string; stderr: string }> {
    if (this.closed) return Promise.reject(new Error("Native process runner is closed."));
    return this.work.run(async () => {
      options.signal.throwIfAborted();
      const result = Promise.withResolvers<{ stdout: string; stderr: string }>();
      // execFile's native callback preserves maxBuffer/error diagnostics. Do
      // not use its AbortSignal shortcut: that callback can precede child close.
      const child = (this.options.launch ?? execFile)(
        command,
        args,
        {
          encoding: "utf8",
          windowsHide: true,
          maxBuffer: options.maxBufferBytes ?? 12 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) result.reject(error);
          else result.resolve({ stdout, stderr });
        },
      );
      const lifetime = new ChildProcessLifetime(child);
      this.children.add(lifetime);
      const stop = () => {
        void lifetime.stop(this.options.stopOptions).catch(() => {
          // Retain unconfirmed children; permanent close reports the join.
        });
      };
      const timer =
        options.timeoutMs !== undefined && options.timeoutMs > 0
          ? setTimeout(stop, options.timeoutMs)
          : undefined;
      options.signal.addEventListener("abort", stop, { once: true });
      if (this.closed || options.signal.aborted) stop();
      void lifetime.closed.then(() => {
        clearTimeout(timer);
        options.signal.removeEventListener("abort", stop);
        this.children.delete(lifetime);
      });
      try {
        return await result.promise;
      } finally {
        await lifetime.closed;
      }
    });
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const barrier = Promise.withResolvers<void>();
    this.closing = barrier.promise;
    void joinRuntimeShutdown(
      [
        ...[...this.children].map((child) => () => child.stop(this.options.stopOptions)),
        () => this.work.drain(),
      ],
      "Native processes have not confirmed shutdown.",
    ).then(barrier.resolve, (error: unknown) => {
      this.closing = undefined;
      barrier.reject(error);
    });
    return barrier.promise;
  }
}
