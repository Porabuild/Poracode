import { describe, expect, it, vi } from "vitest";
import { installRemoteServerLifecycle, type RemoteServerLifecycleEnvironment } from "./lifecycle";

class EventTargetFixture {
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

function fixture(): {
  environment: RemoteServerLifecycleEnvironment;
  window: EventTargetFixture;
  document: EventTargetFixture & { visibilityState: DocumentVisibilityState };
} {
  const window = new EventTargetFixture();
  const document = Object.assign(new EventTargetFixture(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  return { environment: { window, document }, window, document };
}

describe("remote server lifecycle", () => {
  it("coalesces resume signals into one reconnect pass", async () => {
    const test = fixture();
    const reconnect = vi.fn<() => Promise<void>>(async () => {});
    const dispose = installRemoteServerLifecycle(reconnect, test.environment);

    test.window.emit("pageshow");
    test.window.emit("online");
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();

    dispose();
    test.window.emit("pageshow");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it("waits for a visible transition and removes all listeners", async () => {
    const test = fixture();
    const reconnect = vi.fn<() => void>();
    const dispose = installRemoteServerLifecycle(reconnect, test.environment);

    test.document.visibilityState = "hidden";
    test.window.emit("pageshow");
    await Promise.resolve();
    expect(reconnect).not.toHaveBeenCalled();

    test.document.visibilityState = "visible";
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();

    dispose();
    test.window.emit("online");
    test.document.emit("visibilitychange");
    await Promise.resolve();
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
