import { afterEach, describe, expect, it, vi } from "vitest";
import { installShutdown } from "./cliRuntime";

const priorExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = priorExitCode;
  vi.restoreAllMocks();
});

function fixture(dispose: () => Promise<void>) {
  const listeners = new Map<string, () => void>();
  vi.spyOn(process, "on").mockImplementation(((event: string, listener: () => void) => {
    listeners.set(event, listener);
    return process;
  }) as typeof process.on);
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  installShutdown("[synthetic-server]", dispose);
  return { exit, signal: (name = "SIGTERM") => listeners.get(name)!() };
}

describe("CLI shutdown completion", () => {
  it("does not force a successful exit after an unconfirmed runtime stop", async () => {
    const test = fixture(async () => {
      throw new Error("synthetic unconfirmed shutdown");
    });
    test.signal();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(test.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("joins a successful stop once before exiting", async () => {
    const held = Promise.withResolvers<void>();
    const dispose = vi.fn<() => Promise<void>>(() => held.promise);
    const test = fixture(dispose);
    test.signal();
    test.signal("SIGINT");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledOnce();
    expect(test.exit).not.toHaveBeenCalled();
    held.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
