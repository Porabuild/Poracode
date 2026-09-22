import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installFatalErrorHandlers,
  installShutdown,
  summarizeUnconfirmedError,
  type ShutdownControl,
} from "./cliRuntime";

const priorExitCode = process.exitCode;
let shutdownControl: ShutdownControl | undefined;
afterEach(() => {
  // Disarm a deadline a failing assertion may have left armed; otherwise the
  // timer would fire inside the next test and call the restored process.exit.
  shutdownControl?.uninstall();
  shutdownControl = undefined;
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
  const shutdown = installShutdown("[synthetic-server]", dispose, options);
  shutdownControl = shutdown;
  return { exit, signal: (name = "SIGTERM") => listeners.get(name)!(), shutdown };
}

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("CLI shutdown completion", () => {
  it("keeps the hard exit deadline armed after a rejected runtime stop", async () => {
    const test = fixture(
      async () => {
        throw new Error("synthetic unconfirmed shutdown");
      },
      { drainDeadlineMs: 20 },
    );
    test.signal();
    await tick();
    expect(test.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "%s shutdown remains unconfirmed: %s",
      "[synthetic-server]",
      expect.stringContaining("synthetic unconfirmed shutdown"),
    );
    await tick(50);
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("keeps the hard exit deadline armed after a synchronous disposal throw", async () => {
    const test = fixture(
      () => {
        throw new Error("synthetic synchronous shutdown failure");
      },
      { drainDeadlineMs: 20 },
    );
    test.signal();
    expect(test.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    await tick(50);
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("disarms a pending forced exit when the caller uninstalls shutdown", async () => {
    const test = fixture(
      async () => {
        throw new Error("synthetic unconfirmed shutdown");
      },
      { drainDeadlineMs: 20 },
    );
    test.signal();
    await tick();
    expect(process.exitCode).toBe(1);
    test.shutdown.uninstall();
    await tick(50);
    expect(test.exit).not.toHaveBeenCalled();
  });

  it("joins a successful stop once before exiting and disarms the deadline", async () => {
    const held = Promise.withResolvers<void>();
    const dispose = vi.fn<() => Promise<void>>(() => held.promise);
    const test = fixture(dispose, { drainDeadlineMs: 20 });
    test.signal();
    test.signal("SIGINT");
    await tick();
    expect(dispose).toHaveBeenCalledOnce();
    expect(test.exit).not.toHaveBeenCalled();
    held.resolve();
    await tick();
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(0);
    await tick(50);
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

  it("arms the hard deadline on a fatal startup failure without an immediate exit", async () => {
    const dispose = vi.fn<() => Promise<void>>(async () => undefined);
    const test = fixture(dispose, { drainDeadlineMs: 20 });
    test.shutdown.failStartup(new Error("synthetic startup cleanup failure"));
    // A failed startup already attempted cleanup; failStartup never re-disposes
    // and never exits before the declared bound.
    expect(dispose).not.toHaveBeenCalled();
    expect(test.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "%s shutdown remains unconfirmed: %s",
      "[synthetic-server]",
      expect.stringContaining("synthetic startup cleanup failure"),
    );
    await tick(50);
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not restart disposal or extend the bound when a signal follows a fatal startup", async () => {
    const dispose = vi.fn<() => Promise<void>>(() => new Promise(() => undefined));
    const test = fixture(dispose, { drainDeadlineMs: 20 });
    test.shutdown.failStartup(new Error("synthetic startup cleanup failure"));
    test.signal("SIGTERM");
    test.signal("SIGINT");
    expect(dispose).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
    await tick(50);
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("reports a fatal startup failure only once when repeated", async () => {
    const test = fixture(async () => undefined, { drainDeadlineMs: 20 });
    test.shutdown.failStartup(new Error("synthetic first failure"));
    test.shutdown.failStartup(new Error("synthetic second failure"));
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
    await tick(50);
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("disarms the fatal-startup deadline when the cleanup confirms before it fires", async () => {
    const test = fixture(async () => undefined, { drainDeadlineMs: 20 });
    test.shutdown.armFatalStartup();
    // The bound is armed (and the exit is already fatal) before cleanup
    // confirms; uninstall takes lifecycle ownership back and disarms it.
    expect(test.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    test.shutdown.uninstall();
    await tick(50);
    expect(test.exit).not.toHaveBeenCalled();
  });
});

describe("unconfirmed shutdown diagnostics", () => {
  it("bounds an oversized error and keeps name, code, message and a short stack", () => {
    const error = Object.assign(new Error("synthetic failure"), { code: "EFAIL" });
    error.stack = `Error: synthetic failure\n${"    at synthetic (file.ts:1:1)\n".repeat(200)}`;
    const summary = summarizeUnconfirmedError(error);
    expect(summary.length).toBeLessThanOrEqual(560);
    expect(summary).toContain("Error (code EFAIL):");
    expect(summary).toContain("synthetic failure");
    expect(summary.match(/at synthetic/g)).toHaveLength(4);
    expect(summary).toContain("\n…");
  });

  it("bounds a giant message without inspecting it further", () => {
    const error = new Error("x".repeat(200_000));
    const summary = summarizeUnconfirmedError(error);
    expect(summary.length).toBeLessThanOrEqual(560);
    expect(summary).toContain("[truncated]");
  });

  it("never inspects an arbitrary object graph", () => {
    const cyclic: Record<string, unknown> = { message: "not inspected" };
    cyclic.self = cyclic;
    expect(summarizeUnconfirmedError(cyclic)).toBe("[object Object]");
    expect(summarizeUnconfirmedError({ code: "EFAIL", message: "plain object" })).toBe(
      "[object Object]",
    );
  });

  it("keeps the hard deadline armed after an oversized disposal error", async () => {
    const oversized = new Error("x".repeat(200_000));
    oversized.stack = `HugeError: ${"y".repeat(200_000)}`;
    const test = fixture(
      async () => {
        throw oversized;
      },
      { drainDeadlineMs: 20 },
    );
    test.signal();
    await tick();
    const summary = vi.mocked(console.error).mock.calls[0]?.[2];
    expect(typeof summary).toBe("string");
    expect((summary as string).length).toBeLessThanOrEqual(560);
    expect(process.exitCode).toBe(1);
    await tick(50);
    expect(test.exit).toHaveBeenCalledExactlyOnceWith(1);
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
    const flushSync = vi.fn<() => void>();
    installFatalErrorHandlers("[synthetic-server]", { onFatal, flushSync });
    expect(listeners.has("unhandledRejection")).toBe(true);
    const error = new Error("synthetic uncaught");
    listeners.get("uncaughtException")!(error);
    expect(onFatal).toHaveBeenCalledWith("error", expect.stringContaining("uncaught"), error);
    expect(flushSync).toHaveBeenCalledOnce();
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
