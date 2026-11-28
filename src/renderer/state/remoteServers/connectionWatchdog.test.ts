import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRuntime, RemoteServersState } from "./types";
import {
  CONNECTING_HARD_LIMIT_MS,
  CONNECTING_IDLE_LIMIT_MS,
  CONNECTION_WATCHDOG_INTERVAL_MS,
  installRemoteConnectionWatchdog,
} from "./connectionWatchdog";
import {
  __resetEventSocketRegistryForTest,
  setRemoteServerEventSocketEntry,
} from "./eventSocketRegistry";
import { RemoteSocketReconnectPolicy } from "@/shared/remote/socketPolicy";

vi.mock("./browserBridge", () => ({ syncDesktopBrowserBridgeClient: () => {} }));

function runtime(status: RemoteServerRuntime["status"]): RemoteServerRuntime {
  return { status, projects: [], threads: [] };
}

function makeStore(initial: Record<string, RemoteServerRuntime>) {
  let state = { runtime: initial, hostUpdateRestarts: {} } as unknown as RemoteServersState;
  return {
    getState: () => state,
    setState: (update: (current: RemoteServersState) => Partial<RemoteServersState>) => {
      state = { ...state, ...update(state) };
    },
  };
}

describe("installRemoteConnectionWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetEventSocketRegistryForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetEventSocketRegistryForTest();
  });

  it("reports a host unreachable when it stays connecting with nothing in flight", () => {
    const store = makeStore({ idle: runtime("connecting"), live: runtime("online") });
    const dispose = installRemoteConnectionWatchdog(store);
    vi.advanceTimersByTime(CONNECTING_IDLE_LIMIT_MS);
    expect(store.getState().runtime.idle?.status).toBe("connecting");
    vi.advanceTimersByTime(CONNECTION_WATCHDOG_INTERVAL_MS);
    expect(store.getState().runtime.idle).toMatchObject({ status: "offline" });
    expect(store.getState().runtime.idle?.message).toBeTruthy();
    expect(store.getState().runtime.live?.status).toBe("online");
    dispose();
  });

  it("waits for an attempt in flight, but never past the hard limit, and nudges the socket", () => {
    const nudge = vi.fn<() => void>();
    setRemoteServerEventSocketEntry("busy", {
      serverKey: "http://busy.test/",
      socket: null,
      reconnectTimer: null,
      reconnectPolicy: new RemoteSocketReconnectPolicy(),
      connecting: true,
      connectTimeout: null,
      healthPingInterval: null,
      health: null,
      nudge,
    });
    const store = makeStore({ busy: runtime("connecting") });
    const dispose = installRemoteConnectionWatchdog(store);
    vi.advanceTimersByTime(CONNECTING_IDLE_LIMIT_MS + 2 * CONNECTION_WATCHDOG_INTERVAL_MS);
    expect(store.getState().runtime.busy?.status).toBe("connecting");
    vi.advanceTimersByTime(CONNECTING_HARD_LIMIT_MS);
    expect(store.getState().runtime.busy?.status).toBe("offline");
    expect(nudge).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("forgets a host that settled and stops checking once uninstalled", () => {
    const store = makeStore({ flaky: runtime("connecting") });
    const dispose = installRemoteConnectionWatchdog(store);
    vi.advanceTimersByTime(CONNECTION_WATCHDOG_INTERVAL_MS * 2);
    store.setState(() => ({ runtime: { flaky: runtime("online") } }));
    vi.advanceTimersByTime(CONNECTION_WATCHDOG_INTERVAL_MS);
    store.setState(() => ({ runtime: { flaky: runtime("connecting") } }));
    // The clock restarts: the earlier connecting stretch does not count.
    vi.advanceTimersByTime(CONNECTING_IDLE_LIMIT_MS - CONNECTION_WATCHDOG_INTERVAL_MS);
    expect(store.getState().runtime.flaky?.status).toBe("connecting");
    dispose();
    vi.advanceTimersByTime(CONNECTING_HARD_LIMIT_MS * 2);
    expect(store.getState().runtime.flaky?.status).toBe("connecting");
  });

  it("leaves a host that is restarting for an update to its own bounded wait", () => {
    const store = makeStore({ updating: runtime("connecting") });
    store.setState((state) => ({
      hostUpdateRestarts: { ...state.hostUpdateRestarts, updating: "1.1" },
    }));
    const dispose = installRemoteConnectionWatchdog(store);
    vi.advanceTimersByTime(CONNECTING_HARD_LIMIT_MS * 2);
    expect(store.getState().runtime.updating?.status).toBe("connecting");
    dispose();
  });

  it("treats a scheduled retry as an attempt in flight until the hard limit", () => {
    setRemoteServerEventSocketEntry("waiting", {
      serverKey: "http://waiting.test/",
      socket: null,
      reconnectTimer: setTimeout(() => {}, CONNECTING_HARD_LIMIT_MS * 10),
      reconnectPolicy: new RemoteSocketReconnectPolicy(),
      connecting: false,
      connectTimeout: null,
      healthPingInterval: null,
      health: null,
    });
    const store = makeStore({ waiting: runtime("connecting") });
    const dispose = installRemoteConnectionWatchdog(store);
    vi.advanceTimersByTime(CONNECTING_IDLE_LIMIT_MS + 2 * CONNECTION_WATCHDOG_INTERVAL_MS);
    expect(store.getState().runtime.waiting?.status).toBe("connecting");
    vi.advanceTimersByTime(CONNECTING_HARD_LIMIT_MS);
    expect(store.getState().runtime.waiting?.status).toBe("offline");
    dispose();
  });
});
