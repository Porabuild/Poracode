import { describe, expect, it, vi } from "vitest";
import { BackendRemoteBrowserProxy } from "./BackendRemoteBrowserProxy";
import type { BackendBrowserEvent, BackendNativeRequest } from "@/shared/backendHostProtocol";
import type { RemoteBrowserWatcherSink } from "@/main/remote/RemoteBrowserGateway";

type PendingNativeCall = {
  operation: BackendNativeRequest["operation"];
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

/**
 * requestNative stub that parks every request in an ordered queue so each
 * test settles exactly the promises it cares about, in a deterministic order.
 */
function createHarness() {
  const calls: PendingNativeCall[] = [];
  const requestNative = vi.fn<(request: BackendNativeRequest) => Promise<unknown>>(
    (request) =>
      new Promise<unknown>((resolve, reject) => {
        calls.push({ operation: request.operation, resolve, reject });
      }),
  );
  const reportError = vi.fn<(error: unknown, tags?: unknown) => void>(() => {});
  const proxy = new BackendRemoteBrowserProxy(requestNative, reportError);
  const callAt = (index: number): PendingNativeCall => calls[index]!;
  return { proxy, requestNative, reportError, calls, callAt };
}

function createSink() {
  return {
    onFrame: vi.fn<RemoteBrowserWatcherSink["onFrame"]>(),
    onState: vi.fn<RemoteBrowserWatcherSink["onState"]>(),
    onStatus: vi.fn<RemoteBrowserWatcherSink["onStatus"]>(),
  };
}

/** Drain microtasks so settled promise handlers (and any leaked rejection) run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Runs `body` while recording process-level unhandled rejections. The whole
 * point of the proxy fix: no fire-and-forget rejection may reach the
 * process-level handler that would kill the shared backend.
 */
async function withoutUnhandledRejections(body: () => Promise<void>): Promise<void> {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    await body();
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}

describe("BackendRemoteBrowserProxy fire-and-forget native requests", () => {
  describe("watch-start", () => {
    it("reports a failed watch-start and marks watchers unavailable", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, callAt } = createHarness();
        const sink = createSink();
        proxy.watch(sink);

        expect(callAt(0).operation).toBe("browser-watch-start");
        callAt(0).reject(new Error("Browser unavailable."));
        await flush();

        expect(reportError).toHaveBeenCalledOnce();
        const reported = reportError.mock.calls[0]![0] as Error;
        expect(reported.message).toContain("watch failed to start");
        expect(reported.message).toContain("Browser unavailable.");
        expect(reportError.mock.calls[0]![1]).toEqual({ "poracode.feature_area": "remote-access" });
        expect(sink.onStatus).toHaveBeenCalledWith({
          status: "unavailable",
          tabId: null,
          reason: "Browser unavailable.",
        });
      }));

    it("re-issues watch-start for watchers that join after a failed start", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, calls, callAt } = createHarness();
        const stranded = createSink();
        const late = createSink();

        proxy.watch(stranded);
        callAt(0).reject(new Error("Browser unavailable."));
        await flush();

        proxy.watch(late);
        expect(calls).toHaveLength(2);
        expect(callAt(1).operation).toBe("browser-watch-start");
        callAt(1).resolve(null);
        await flush();

        // Both watchers stay served by the recovered watch.
        const active = { status: "active" as const, tabId: "tab-1" };
        proxy.publish({ type: "status", status: active });
        expect(stranded.onStatus).toHaveBeenCalledWith(active);
        expect(late.onStatus).toHaveBeenCalledWith(active);
      }));

    it("does not duplicate watch-start while one is unsettled", () => {
      const { proxy, calls } = createHarness();
      proxy.watch(createSink());
      proxy.watch(createSink());
      expect(calls).toHaveLength(1);
    });

    it("does not re-issue watch-start while Electron is already watching", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, calls, callAt } = createHarness();
        proxy.watch(createSink());
        callAt(0).resolve(null);
        await flush();

        proxy.watch(createSink());
        expect(calls).toHaveLength(1);
      }));

    it("ignores a watch-start that fails after the watcher left", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, calls, callAt } = createHarness();
        const sink = createSink();
        const unsubscribe = proxy.watch(sink);

        // The watcher leaves while the start is still on the wire; the ordered
        // stop is what actually ends the watch, so the late start failure is
        // obsolete completion and must not be reported for an empty sink set.
        unsubscribe();
        expect(calls.map((call) => call.operation)).toEqual([
          "browser-watch-start",
          "browser-watch-stop",
        ]);
        callAt(0).reject(new Error("Browser unavailable."));
        callAt(1).resolve(null);
        await flush();

        expect(reportError).not.toHaveBeenCalled();
        expect(sink.onStatus).not.toHaveBeenCalled();

        // The next watcher still gets a fresh start.
        proxy.watch(createSink());
        expect(calls).toHaveLength(3);
        expect(callAt(2).operation).toBe("browser-watch-start");
      }));
  });

  describe("refresh", () => {
    it("retries the start itself when refresh follows a failed watch-start", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, calls, callAt } = createHarness();
        proxy.watch(createSink());
        callAt(0).reject(new Error("Browser unavailable."));
        await flush();

        proxy.refresh();

        // `browser-refresh` cannot recover: Electron only mirrors while a
        // watcher is registered, so the start has to be re-issued.
        expect(calls).toHaveLength(2);
        expect(callAt(1).operation).toBe("browser-watch-start");
      }));

    it("sends browser-refresh when the native watch is active", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, calls, callAt } = createHarness();
        proxy.watch(createSink());
        callAt(0).resolve(null);
        await flush();

        proxy.refresh();

        expect(calls).toHaveLength(2);
        expect(callAt(1).operation).toBe("browser-refresh");
      }));

    it("reports a failed refresh without disturbing watchers", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, callAt } = createHarness();
        const sink = createSink();
        proxy.watch(sink);
        callAt(0).resolve(null);
        await flush();

        proxy.refresh();
        callAt(1).reject(new Error('Native request "browser-refresh" timed out.'));
        await flush();

        expect(reportError).toHaveBeenCalledOnce();
        expect((reportError.mock.calls[0]![0] as Error).message).toBe(
          'Remote browser refresh failed: Native request "browser-refresh" timed out.',
        );
        expect(sink.onStatus).not.toHaveBeenCalled();
      }));

    it("does not send browser-refresh when nobody is watching", () => {
      const { proxy, calls } = createHarness();
      proxy.refresh();
      expect(calls).toHaveLength(0);
    });
  });

  describe("watch-stop and dispose", () => {
    it("reports a failed watch-stop and recovers for the next watcher", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, calls, callAt } = createHarness();
        const unsubscribe = proxy.watch(createSink());
        callAt(0).resolve(null);
        await flush();

        unsubscribe();
        expect(callAt(1).operation).toBe("browser-watch-stop");
        callAt(1).reject(new Error('Native request "browser-watch-stop" timed out.'));
        await flush();

        expect(reportError).toHaveBeenCalledOnce();
        expect((reportError.mock.calls[0]![0] as Error).message).toContain("watch failed to stop");

        // An uncertain stop must not strand the next watch: Electron's
        // watch-start is idempotent, so re-issuing is always safe.
        proxy.watch(createSink());
        expect(calls).toHaveLength(3);
        expect(callAt(2).operation).toBe("browser-watch-start");
      }));

    it("sends watch-stop on dispose and reports its failure", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, calls, callAt } = createHarness();
        proxy.watch(createSink());
        callAt(0).resolve(null);
        await flush();

        proxy.dispose();
        expect(calls.map((call) => call.operation)).toEqual([
          "browser-watch-start",
          "browser-watch-stop",
        ]);
        callAt(1).reject(new Error("Backend-host IPC channel is disconnected."));
        await flush();

        expect(reportError).toHaveBeenCalledOnce();
        expect((reportError.mock.calls[0]![0] as Error).message).toContain("watch failed to stop");
      }));

    it("does not send watch-stop on dispose when the watch never started", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, calls, callAt } = createHarness();
        proxy.watch(createSink());
        callAt(0).reject(new Error("Browser unavailable."));
        await flush();
        expect(reportError).toHaveBeenCalledOnce();

        proxy.dispose();
        expect(calls).toHaveLength(1);
      }));

    it("does not let a late start success resurrect a disposed watch", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, calls, callAt } = createHarness();
        proxy.watch(createSink());
        proxy.dispose();
        expect(calls.map((call) => call.operation)).toEqual([
          "browser-watch-start",
          "browser-watch-stop",
        ]);

        callAt(0).resolve(null);
        callAt(1).resolve(null);
        await flush();

        proxy.watch(createSink());
        expect(calls).toHaveLength(3);
        expect(callAt(2).operation).toBe("browser-watch-start");
      }));
  });

  describe("unrelated functionality after failures", () => {
    it("keeps awaited state/command/input rejecting normally without reporting", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, reportError, callAt } = createHarness();

        const state = proxy.state();
        expect(callAt(0).operation).toBe("browser-state");
        callAt(0).reject(new Error("Browser unavailable."));
        await expect(state).rejects.toThrow("Browser unavailable.");

        const command = proxy.command({ kind: "reload", tabId: "tab-1" });
        expect(callAt(1).operation).toBe("browser-command");
        callAt(1).reject(new Error("No browser tabs are open."));
        await expect(command).rejects.toThrow("No browser tabs are open.");

        const input = proxy.dispatchInput({ kind: "tap", x: 1, y: 2 });
        expect(callAt(2).operation).toBe("browser-input");
        callAt(2).reject(new Error("Browser unavailable."));
        await expect(input).rejects.toThrow("Browser unavailable.");

        expect(reportError).not.toHaveBeenCalled();
      }));

    it("keeps fanning events out to healthy sinks when one sink throws", () =>
      withoutUnhandledRejections(async () => {
        const { proxy, calls, callAt } = createHarness();
        const broken = createSink();
        const healthy = createSink();
        proxy.watch(broken);
        proxy.watch(healthy); // dedupes into the one in-flight watch-start
        expect(calls).toHaveLength(1);
        callAt(0).resolve(null);
        await flush();

        broken.onState.mockImplementation(() => {
          throw new Error("sink is broken");
        });
        const event: BackendBrowserEvent = {
          type: "state",
          state: { tabs: [], activeTabId: "tab-1" },
        };
        expect(() => proxy.publish(event)).not.toThrow();
        expect(healthy.onState).toHaveBeenCalledWith(event.state);
      }));
  });
});
