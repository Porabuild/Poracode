import { describe, expect, it, vi } from "vitest";
import {
  installRemoteServerLifecycle,
  REMOTE_SERVER_LONG_SUSPEND_MS,
  type RemoteServerLifecycleEnvironment,
  type RemoteServerResumeSignal,
} from "./lifecycle";

class EventTargetFixture {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, init: Record<string, unknown> = {}): void {
    const event = Object.assign(new Event(type), init);
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function fixture(): {
  environment: RemoteServerLifecycleEnvironment;
  window: EventTargetFixture;
  document: EventTargetFixture & { visibilityState: DocumentVisibilityState };
  clock: { now: number };
} {
  const window = new EventTargetFixture();
  const document = Object.assign(new EventTargetFixture(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const clock = { now: 1_000 };
  return { environment: { window, document, now: () => clock.now }, window, document, clock };
}

function reconnectSpy() {
  return vi.fn<(signal: RemoteServerResumeSignal) => Promise<void>>(async () => {});
}

describe("remote server lifecycle", () => {
  it("coalesces resume signals into one pass carrying the strongest signal", async () => {
    const test = fixture();
    const reconnect = reconnectSpy();
    const dispose = installRemoteServerLifecycle(reconnect, test.environment);

    test.window.emit("pageshow", { persisted: true });
    test.window.emit("online");
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
    expect(reconnect).toHaveBeenLastCalledWith({ forceTransportReconnect: true });

    dispose();
    test.window.emit("online");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it("only verifies live transports after an ordinary tab switch", async () => {
    const test = fixture();
    const reconnect = reconnectSpy();
    installRemoteServerLifecycle(reconnect, test.environment);

    test.document.visibilityState = "hidden";
    test.document.emit("visibilitychange");
    test.clock.now += REMOTE_SERVER_LONG_SUSPEND_MS - 1;
    test.document.visibilityState = "visible";
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
    expect(reconnect).toHaveBeenLastCalledWith({ forceTransportReconnect: false });
  });

  it("replaces transports after a long suspension or a network change", async () => {
    const test = fixture();
    const reconnect = reconnectSpy();
    installRemoteServerLifecycle(reconnect, test.environment);

    test.document.visibilityState = "hidden";
    test.document.emit("visibilitychange");
    test.clock.now += REMOTE_SERVER_LONG_SUSPEND_MS;
    test.document.visibilityState = "visible";
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenLastCalledWith({ forceTransportReconnect: true });

    test.window.emit("online");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(reconnect).toHaveBeenLastCalledWith({ forceTransportReconnect: true });
  });

  it("ignores the pageshow of a fresh load, which the initial mount already connects", async () => {
    const test = fixture();
    const reconnect = reconnectSpy();
    installRemoteServerLifecycle(reconnect, test.environment);

    test.window.emit("pageshow", { persisted: false });
    await Promise.resolve();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("waits for a visible transition and removes all listeners", async () => {
    const test = fixture();
    const reconnect = reconnectSpy();
    const dispose = installRemoteServerLifecycle(reconnect, test.environment);

    test.document.visibilityState = "hidden";
    test.window.emit("online");
    await Promise.resolve();
    expect(reconnect).not.toHaveBeenCalled();

    test.document.visibilityState = "visible";
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
    // The network change seen while hidden still forces the visible pass.
    expect(reconnect).toHaveBeenLastCalledWith({ forceTransportReconnect: true });

    dispose();
    test.window.emit("online");
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
