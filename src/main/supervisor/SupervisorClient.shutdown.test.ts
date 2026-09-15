import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const mocks = vi.hoisted(() => ({
  fork: vi.fn<(...args: unknown[]) => unknown>(),
  terminate: vi.fn<(child: unknown) => void>(),
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: mocks.terminate }));

import { SupervisorClient } from "./SupervisorClient";

class FakeChild extends EventEmitter {
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
  kill = vi.fn<(signal?: NodeJS.Signals) => boolean>(() => true);
  finish() {
    this.connected = false;
    this.exitCode = 0;
    this.emit("exit", 0, null);
    this.emit("close", 0, null);
  }
}

function fixture() {
  const first = new FakeChild();
  const second = new FakeChild();
  mocks.fork.mockReturnValueOnce(first).mockReturnValueOnce(second);
  const onEvent = vi.fn<(event: SupervisorEvent) => void>();
  const onOutputShed = vi.fn<(threadIds: string[]) => void>();
  const client = new SupervisorClient({
    baseDir: "/fixture",
    supervisorPath: "/fixture/supervisor.cjs",
    appVersion: "test",
    isDev: false,
    wslHelpersDir: "/fixture/wsl",
    secretStorageKey: "fixture",
    onEvent,
    onOutputShed,
    onReset: vi.fn<() => void>(),
  });
  void client.start();
  return { client, first, second, onEvent, onOutputShed };
}

describe("SupervisorClient joined shutdown", () => {
  beforeEach(() => {
    mocks.fork.mockReset();
    mocks.terminate.mockReset();
  });

  it("waits for the retiring child and accepts its final events only before exit", async () => {
    const { client, first, onEvent } = fixture();
    let settled = false;
    const disposing = Promise.resolve(client.dispose()).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    const finalEvent: SupervisorEvent = { type: "git-changed", projectId: "fixture" };
    first.emit("message", finalEvent);
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(finalEvent);
    first.exitCode = 0;
    first.emit("exit", 0, null);
    await Promise.resolve();
    expect(settled).toBe(false);
    // The process can exit before buffered IPC has finished reaching the parent.
    first.emit("message", finalEvent);
    expect(onEvent).toHaveBeenCalledTimes(2);
    first.finish();
    await disposing;
    first.emit("message", finalEvent);
    expect(onEvent).toHaveBeenCalledTimes(2);
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("disposed");
  });

  it("coalesces restarts and prevents a late replacement after disposal", async () => {
    const { client, first } = fixture();
    const restarting = client.restart();
    const secondRestart = client.restart();
    expect(secondRestart).toBe(restarting);
    const guarded = restarting.catch((error: unknown) => error);
    const disposing = client.dispose();
    expect(client.dispose()).toBe(disposing);
    first.finish();
    await disposing;
    expect(await guarded).toMatchObject({ message: "Supervisor client is disposed." });
    expect(mocks.fork).toHaveBeenCalledTimes(1);
  });

  it("does not launch a replacement until the prior supervisor exits", async () => {
    const { client, first, second } = fixture();
    const restarting = client.restart();
    expect(mocks.fork).toHaveBeenCalledTimes(1);
    first.finish();
    await restarting;
    expect(mocks.fork).toHaveBeenCalledTimes(2);
    const disposing = client.dispose();
    second.finish();
    await disposing;
  });

  it("ignores stale events, shed signals and replies from the replaced child", async () => {
    const { client, first, second, onEvent, onOutputShed } = fixture();
    const restarting = client.restart();
    first.finish();
    await restarting;
    const pending = client.call("any" as never, undefined as never);
    await vi.waitFor(() => expect(second.send).toHaveBeenCalled());
    const request = second.send.mock.calls[0]?.[0] as { id: string };
    first.emit("message", { type: "git-changed", projectId: "stale" });
    first.emit("message", { kind: "supervisor-output-shed", threadIds: ["stale"] });
    first.emit("message", { replyTo: request.id, ok: true, data: "stale" });
    second.emit("message", { replyTo: request.id, ok: true, data: "current" });
    await expect(pending).resolves.toBe("current");
    expect(onEvent).not.toHaveBeenCalled();
    expect(onOutputShed).not.toHaveBeenCalled();
    const disposing = client.dispose();
    second.finish();
    await disposing;
  });
});
