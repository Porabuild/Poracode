import { afterEach, describe, expect, it, vi } from "vitest";
import { installFatalErrorHandlers, installShutdown } from "./cliRuntime";

const priorExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = priorExitCode;
  vi.restoreAllMocks();
});

function fixture(dispose: () => Promise<void>, options?: { readonly drainDeadlineMs?: number }) {
  const listeners = new Map<string, () => void>();
  vi.spyOn(process, "on").mockImplementation(((event: string, listener: () => void) => {
    listeners.set(event, listener);
    return process;
  }) as typeof process.on);
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(process, "off").mockImplementation((() => process) as typeof process.off);
  installShutdown("[synthetic-server]", dispose, options);
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

  it("force-exits within the drain deadline when disposal hangs", async () => {
    const test = fixture(
      () => new Promise<void>(() => undefined), // never settles
      { drainDeadlineMs: 5 },
    );
    test.signal();
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not double-report when disposal fails after the deadline already fired", async () => {
    const held = Promise.withResolvers<void>();
    const test = fixture(() => held.promise, { drainDeadlineMs: 5 });
    test.signal();
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(test.exit).toHaveBeenCalledWith(1);
    held.reject(new Error("late failure"));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(test.exit).toHaveBeenCalledTimes(1);
  });
});

describe("fatal error handlers", () => {
  function handlerFixture() {
    const listeners = new Map<string, (value: unknown) => void>();
    vi.spyOn(process, "on").mockImplementation(((
      event: string,
      listener: (value: unknown) => void,
    ) => {
      listeners.set(event, listener);
      return process;
    }) as typeof process.on);
    vi.spyOn(process, "off").mockImplementation((() => process) as typeof process.off);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    return { listeners, exit };
  }

  it("reports an uncaught exception with onFatal and force-exits 1", () => {
    const { listeners, exit } = handlerFixture();
    const onFatal = vi.fn<(level: "error", message: string, error: unknown) => void>();
    installFatalErrorHandlers("[synthetic-server]", { onFatal });
    expect(listeners.has("unhandledRejection")).toBe(true);
    const error = new Error("synthetic uncaught");
    listeners.get("uncaughtException")!(error);
    expect(onFatal).toHaveBeenCalledWith("error", expect.stringContaining("uncaught"), error);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("reports unhandled rejections the same way and can skip them", () => {
    const { listeners, exit } = handlerFixture();
    installFatalErrorHandlers("[synthetic-server]", {});
    listeners.get("unhandledRejection")!("reason");
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);

    const without = handlerFixture();
    installFatalErrorHandlers("[synthetic-server]", { rejections: false });
    expect(without.listeners.has("unhandledRejection")).toBe(false);
  });
});
