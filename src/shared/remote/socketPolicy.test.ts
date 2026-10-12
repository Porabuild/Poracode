import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isUnauthorizedRemoteSocketClose,
  REMOTE_LOCAL_SOCKET_POLICY,
  REMOTE_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "./socketPolicy";

describe("remote socket policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances and resets reconnect backoff attempts", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const policy = new RemoteSocketReconnectPolicy();

    expect(policy.nextDelay()).toBe(500);
    expect(policy.nextDelay()).toBe(1_000);
    policy.reset();
    expect(policy.nextDelay()).toBe(500);

    random.mockRestore();
  });

  it("keeps the default cadence and applies parameterized local values with jitter", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(1);
    const defaults = new RemoteSocketReconnectPolicy();
    expect(defaults.nextDelay()).toBe(REMOTE_SOCKET_POLICY.reconnectBaseMs);
    expect(defaults.nextDelay()).toBe(REMOTE_SOCKET_POLICY.reconnectBaseMs * 2);
    expect(defaults.nextDelay()).toBe(REMOTE_SOCKET_POLICY.reconnectBaseMs * 4);

    const local = new RemoteSocketReconnectPolicy({
      baseMs: REMOTE_LOCAL_SOCKET_POLICY.reconnectBaseMs,
      maxMs: REMOTE_LOCAL_SOCKET_POLICY.reconnectMaxMs,
    });
    expect(local.nextDelay()).toBe(REMOTE_LOCAL_SOCKET_POLICY.reconnectBaseMs);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(local.nextDelay()).toBeLessThanOrEqual(REMOTE_LOCAL_SOCKET_POLICY.reconnectMaxMs);
    }

    random.mockRestore();
  });

  it("honors a custom health-pong timeout for the local policy", async () => {
    const socket = {};
    const onDead = vi.fn<(socket: object) => void>();
    const monitor = new RemoteSocketHealthMonitor({
      isCurrent: () => true,
      isOpen: () => true,
      send: vi.fn<(socket: object, payload: string) => void>(),
      onDead,
      timeoutMs: 1_000,
    });

    monitor.probe(socket);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(onDead).toHaveBeenCalledWith(socket);
  });

  it("requires a correlated pong before the health timeout", async () => {
    const socket = {};
    const send = vi.fn<(socket: object, payload: string) => void>();
    const onDead = vi.fn<(socket: object) => void>();
    const monitor = new RemoteSocketHealthMonitor({
      isCurrent: (candidate) => candidate === socket,
      isOpen: () => true,
      send,
      onDead,
    });

    monitor.probe(socket);
    const ping = JSON.parse(send.mock.calls[0]![1]) as { id: string };
    expect(monitor.acceptPong("other")).toBe(false);
    expect(monitor.acceptPong(ping.id)).toBe(true);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(onDead).not.toHaveBeenCalled();

    monitor.probe(socket);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(onDead).toHaveBeenCalledWith(socket);
  });

  it("releases a pending probe when its socket is no longer current", async () => {
    const socket = {};
    let current = true;
    const send = vi.fn<(socket: object, payload: string) => void>();
    const monitor = new RemoteSocketHealthMonitor({
      isCurrent: () => current,
      isOpen: () => true,
      send,
      onDead: vi.fn<(socket: object) => void>(),
    });

    monitor.probe(socket);
    current = false;
    await vi.advanceTimersByTimeAsync(5_001);
    current = true;
    monitor.probe(socket);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("recognizes policy and explicit expiry closes", () => {
    expect(isUnauthorizedRemoteSocketClose(1008, "")).toBe(true);
    expect(isUnauthorizedRemoteSocketClose(1000, "Remote access session expired")).toBe(true);
    expect(isUnauthorizedRemoteSocketClose(1000, "normal")).toBe(false);
  });
});
