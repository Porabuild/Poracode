import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalAdmissionMessage } from "@/shared/canonicalAdmissionProtocol";
import type { SupervisorEvent } from "@/shared/ipc";
const mocks = vi.hoisted(() => ({ fork: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
import { SupervisorClient } from "./SupervisorClient";

class Child extends EventEmitter {
  connected = true;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = null;
  stderr = null;
  send = vi.fn<(message: unknown, callback?: (error: Error | null) => void) => boolean>(
    (_message, callback) => {
      callback?.(null);
      return true;
    },
  );
  finish() {
    this.connected = false;
    this.exitCode = 0;
    this.emit("exit", 0, null);
    this.emit("close", 0, null);
  }
}
const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => mocks.fork.mockReset());
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function fixture() {
  const first = new Child(),
    second = new Child();
  mocks.fork.mockReturnValueOnce(first).mockReturnValueOnce(second);
  const onEvent = vi.fn<(event: SupervisorEvent) => void>();
  const onCanonicalAdmission = vi.fn<(message: CanonicalAdmissionMessage) => void>();
  const reportError = vi.fn<(error: unknown) => void>();
  const onReset = vi.fn<() => void>();
  const client = new SupervisorClient({
    baseDir: "/fixture",
    supervisorPath: "/fixture/supervisor.cjs",
    appVersion: "test",
    isDev: false,
    wslHelpersDir: "/fixture/wsl",
    secretStorageKey: "key",
    onEvent,
    onCanonicalAdmission,
    onReset,
    reportError,
  });
  void client.start();
  cleanups.push(async () => {
    first.finish();
    second.finish();
    await client.dispose();
  });
  return { client, first, second, onEvent, onCanonicalAdmission, onReset, reportError };
}
const quote = {
  kind: "canonical-admission-request",
  version: 2,
  generation: "boot",
  requestSeq: 1,
  threadId: "thread",
  cost: { eventCount: 1, eventBytes: 300, maxEventBytes: 300 },
};
function advertise(child: Child, versions?: unknown) {
  child.emit("message", {
    kind: "supervisor-flow-control-capabilities",
    versions: [1],
    supportsCanonicalCredit: true,
    canonicalFlowGeneration: "boot",
    ...(versions === undefined ? {} : { canonicalAdmissionVersions: versions }),
  });
}

describe("SupervisorClient admission2 compatibility and isolation", () => {
  it("released flow1 peer receives no admission controls and keeps ordinary canonical events", () => {
    const h = fixture();
    advertise(h.first);
    h.client.sendCanonicalAdmissionControl({
      control: "canonical-admission-enable",
      version: 2,
      generation: "boot",
    });
    expect(h.first.send).not.toHaveBeenCalled();
    h.first.emit("message", quote);
    expect(h.onCanonicalAdmission).not.toHaveBeenCalled();
    expect(h.onEvent).not.toHaveBeenCalled();
    const ordinary: SupervisorEvent = {
      type: "thread-runtime-event",
      threadId: "thread",
      event: { type: "item.completed", threadId: "thread", itemId: "item" },
    };
    h.first.emit("message", ordinary);
    expect(h.onEvent).toHaveBeenCalledExactlyOnceWith(ordinary);
    h.client.acknowledgeCanonicalFlow(1);
    expect(h.client.getPeerCanonicalCapabilities()).toEqual({
      supportsCanonicalCredit: true,
      generation: "boot",
    });
  });
  it("only explicit admission2 and matching boot identity route private messages, with no public fallthrough", () => {
    const h = fixture();
    advertise(h.first, [2]);
    h.first.emit("message", quote);
    expect(h.onCanonicalAdmission).toHaveBeenCalledExactlyOnceWith(quote);
    expect(h.onEvent).not.toHaveBeenCalled();
    h.first.emit("message", { ...quote, generation: "old" });
    h.first.emit("message", { ...quote, cost: { ...quote.cost, eventBytes: Infinity } });
    expect(h.onCanonicalAdmission).toHaveBeenCalledTimes(1);
    expect(h.onEvent).not.toHaveBeenCalled();
    h.client.sendCanonicalAdmissionControl({
      control: "canonical-admission-enable",
      version: 2,
      generation: "old",
    });
    expect(h.first.send).not.toHaveBeenCalled();
    h.client.sendCanonicalAdmissionControl({
      control: "canonical-admission-enable",
      version: 2,
      generation: "boot",
    });
    expect(h.first.send).toHaveBeenCalledExactlyOnceWith(
      { control: "canonical-admission-enable", version: 2, generation: "boot" },
      expect.any(Function),
    );
  });
  it("malformed optional capabilities cannot negotiate or escape the IPC handler", () => {
    const h = fixture();
    expect(() => advertise(h.first, {})).not.toThrow();
    h.first.emit("message", quote);
    expect(h.onCanonicalAdmission).not.toHaveBeenCalled();
    expect(h.onEvent).not.toHaveBeenCalled();
    expect(h.client.getPeerCanonicalCapabilities().admissionVersion).toBeUndefined();
  });
  it("a private consumer error is isolated and later public events still arrive", () => {
    const h = fixture();
    advertise(h.first, [2]);
    h.onCanonicalAdmission.mockImplementation(() => {
      throw new Error("consumer");
    });
    expect(() => h.first.emit("message", quote)).not.toThrow();
    expect(h.reportError).toHaveBeenCalledOnce();
    h.first.emit("message", { type: "thread-reset", threadId: "thread" });
    expect(h.onEvent).toHaveBeenCalledExactlyOnceWith({ type: "thread-reset", threadId: "thread" });
  });
  it("positive close fences retired messages and a replacement must negotiate independently", async () => {
    const h = fixture();
    advertise(h.first, [2]);
    h.first.exitCode = 0;
    h.first.emit("exit", 0, null);
    expect(h.onReset).not.toHaveBeenCalled();
    h.first.emit("message", quote);
    expect(h.onCanonicalAdmission).toHaveBeenCalledTimes(1);
    h.first.finish();
    expect(h.onReset).toHaveBeenCalledOnce();
    await h.client.start();
    advertise(h.second);
    h.first.emit("message", quote);
    h.second.emit("message", quote);
    expect(h.onCanonicalAdmission).toHaveBeenCalledTimes(1);
    expect(h.onEvent).not.toHaveBeenCalled();
  });
});
