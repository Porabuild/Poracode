import { EventEmitter } from "node:events";
import type { ChildProcess, PromiseWithChild } from "node:child_process";
import { vi } from "vitest";

/** Model execFile's child handle and response separately from OS pipe closure. */
export function mockExecFileCommand<T>(
  result: Promise<T>,
  closeOnSettle = true,
): PromiseWithChild<T> {
  const stopped = Promise.withResolvers<never>();
  let stoppedSignal: NodeJS.Signals | number | undefined;
  const child = Object.assign(new EventEmitter(), {
    pid: 42,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn<ChildProcess["kill"]>((signal = "SIGTERM") => {
      stoppedSignal = signal;
      stopped.reject(Object.assign(new Error("Command stopped"), { killed: true, signal }));
      return true;
    }),
  });
  const request = Object.assign(Promise.race([result, stopped.promise]), {
    child: child as unknown as ChildProcess,
  });
  const close = (exitCode: number) => {
    if (!closeOnSettle) return;
    if (typeof stoppedSignal === "string") child.signalCode = stoppedSignal;
    else child.exitCode = exitCode;
    child.emit("close", child.exitCode, child.signalCode);
  };
  void request.then(
    () => close(0),
    () => close(1),
  );
  return request;
}
