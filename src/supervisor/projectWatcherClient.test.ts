import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GIT_HELPER_PROTOCOL_VERSION } from "./git/gitNativeHelperProtocol";
import { ProjectWatcherClient } from "./projectWatcherClient";
import type { ProjectWatchCommand, ProjectWatchScope } from "./projectWatcherProtocol";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn<(...args: unknown[]) => unknown>(),
  workers: [] as FakeWorker[],
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("./git/gitNativeHelperClient", () => ({ nativeGitHelperBinaryPath: () => undefined }));
vi.mock("node:worker_threads", () => ({
  Worker: class extends EventEmitter {
    postMessage = vi.fn<(command: ProjectWatchCommand) => void>();
    terminate = vi.fn<() => Promise<number>>(async () => {
      this.emit("exit", 0);
      return 0;
    });
    unref = vi.fn<() => void>();
    constructor() {
      super();
      mocks.workers.push(this);
    }
  },
}));

interface FakeWorker extends EventEmitter {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

function childHarness() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    kill: vi.fn<() => boolean>(() => {
      queueMicrotask(() => child.emit("close", 0));
      return true;
    }),
    unref: vi.fn<() => void>(),
  });
  const writes: ProjectWatchCommand[] = [];
  child.stdin.on("data", (data: Buffer) => {
    writes.push(JSON.parse(data.toString()) as ProjectWatchCommand);
  });
  return {
    child,
    writes,
    reply(value: object) {
      child.stdout.write(
        `${JSON.stringify({ protocolVersion: GIT_HELPER_PROTOCOL_VERSION, ...value })}\n`,
      );
    },
  };
}

const clients: ProjectWatcherClient[] = [];
function client(native = true) {
  const instance = new ProjectWatcherClient({
    nativeBinaryPath: native ? "/helper" : false,
    workerPath: "/worker.cjs",
  });
  clients.push(instance);
  return instance;
}
function workerReply(worker: FakeWorker, message: object) {
  worker.emit("message", { protocolVersion: GIT_HELPER_PROTOCOL_VERSION, ...message });
}

beforeEach(() => {
  mocks.spawn.mockReset();
  mocks.workers.length = 0;
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((entry) => entry.dispose()));
  vi.useRealTimers();
});

describe("ProjectWatcherClient", () => {
  it("accepts ignore-only hints while preserving released v3 helper notifications", async () => {
    const harness = childHarness();
    mocks.spawn.mockReturnValue(harness.child);
    const changed = vi.fn<(scope: ProjectWatchScope, gitChanged?: boolean) => void>();
    const subscription = client().watch("/repo", changed);
    harness.reply({ kind: "ready", id: 0 });
    harness.reply({ kind: "ready", id: 1 });
    await subscription.ready;
    harness.reply({ kind: "changed", id: 1, scope: "worktree", gitChanged: false });
    harness.reply({ kind: "changed", id: 1, scope: "worktree" });
    harness.reply({ kind: "changed", id: 1, scope: "git" });
    expect(changed.mock.calls).toEqual([["worktree", false], ["worktree"], ["git"]]);
  });

  it.each([false, true])(
    "recovers after a stable replacement with clean close %s",
    async (cleanClose) => {
      vi.useFakeTimers();
      const instance = client(false);
      const changed = vi.fn<(scope: ProjectWatchScope) => void>();
      const failed = vi.fn<(error: Error) => void>();
      const subscription = instance.watch("/repo", changed, failed);
      const first = mocks.workers[0]!;
      workerReply(first, { kind: "ready", id: 0 });
      workerReply(first, { kind: "ready", id: 1 });
      await subscription.ready;
      first.emit("exit", 1);
      const replacement = mocks.workers[1]!;
      workerReply(replacement, { kind: "ready", id: 0 });
      workerReply(replacement, { kind: "ready", id: 1 });
      await vi.advanceTimersByTimeAsync(30_000);
      let nextId = 1;
      let expectedWorkers = 3;
      let failingWorker = replacement;
      if (cleanClose) {
        subscription.unsubscribe();
        await Promise.resolve();
        const next = instance.watch("/next", changed, failed);
        nextId = 2;
        expectedWorkers = 4;
        failingWorker = mocks.workers[2]!;
        workerReply(failingWorker, { kind: "ready", id: 0 });
        workerReply(failingWorker, { kind: "ready", id: nextId });
        await next.ready;
      }
      failingWorker.emit("exit", 1);
      expect(mocks.workers).toHaveLength(expectedWorkers);
      const recovered = mocks.workers[expectedWorkers - 1]!;
      workerReply(recovered, { kind: "ready", id: 0 });
      workerReply(recovered, { kind: "ready", id: nextId });
      changed.mockClear();
      workerReply(recovered, { kind: "changed", id: nextId, scope: "git" });
      expect(changed).toHaveBeenCalledExactlyOnceWith("git");
      expect(failed).not.toHaveBeenCalled();
    },
  );

  it("stops a worker crash loop even when each replacement acknowledges the watch", async () => {
    const instance = client(false);
    const failed = vi.fn<(error: Error) => void>();
    const subscription = instance.watch("/repo", () => {}, failed);
    const first = mocks.workers[0]!;
    workerReply(first, { kind: "ready", id: 0 });
    workerReply(first, { kind: "ready", id: 1 });
    await subscription.ready;
    first.emit("exit", 1);
    const replacement = mocks.workers[1]!;
    workerReply(replacement, { kind: "ready", id: 0 });
    workerReply(replacement, { kind: "ready", id: 1 });
    replacement.emit("exit", 1);
    expect(mocks.workers).toHaveLength(2);
    expect(failed).toHaveBeenCalledExactlyOnceWith(new Error("Project watcher worker exited (1)"));
  });

  it("isolates repeated subscription failures from healthy worker watches", async () => {
    const instance = client(false);
    const failed = vi.fn<(error: Error) => void>();
    const healthyChanged = vi.fn<(scope: ProjectWatchScope) => void>();
    const a = instance.watch("/a", () => {}, failed);
    const b = instance.watch("/b", () => {}, failed);
    const healthy = instance.watch("/healthy", healthyChanged);
    const worker = mocks.workers[0]!;
    workerReply(worker, { kind: "ready", id: 0 });
    for (const id of [1, 2, 3]) workerReply(worker, { kind: "ready", id });
    await Promise.all([a.ready, b.ready, healthy.ready]);
    for (const id of [1, 2]) {
      workerReply(worker, { kind: "error", id, error: "root removed" });
      expect(worker.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "watch", id }),
      );
      workerReply(worker, { kind: "error", id, error: "root absent on retry" });
    }
    workerReply(worker, { kind: "changed", id: 3, scope: "worktree" });
    expect(healthyChanged).toHaveBeenCalledExactlyOnceWith("worktree");
    expect(failed).toHaveBeenCalledTimes(2);
    expect(mocks.workers).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("rejects a missing native root without downgrading healthy subscriptions", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const changed = vi.fn<(scope: ProjectWatchScope) => void>();
    const healthy = instance.watch("/healthy", changed);
    const missing = instance.watch("/missing", () => {});
    const rejected = missing.ready.catch((error: unknown) => error);
    native.reply({ kind: "ready", id: 0 });
    native.reply({ kind: "ready", id: 1 });
    native.reply({ kind: "error", id: 2, error: "missing root" });
    await expect(rejected).resolves.toEqual(new Error("missing root"));
    await healthy.ready;
    native.reply({ kind: "changed", id: 1, scope: "git" });
    expect(changed).toHaveBeenCalledExactlyOnceWith("git");
    expect(native.child.kill).not.toHaveBeenCalled();
    expect(mocks.workers).toHaveLength(0);
  });

  it("shares one native watch process and only delivers acknowledged scoped notifications", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const onA = vi.fn<(scope: ProjectWatchScope) => void>(),
      onB = vi.fn<(scope: ProjectWatchScope) => void>();
    const a = instance.watch("/a", onA),
      b = instance.watch("/b", onB);
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.spawn.mock.calls[0]?.[1]).toEqual(["--watch-v3"]);
    expect(native.writes).toEqual([]);
    native.reply({ kind: "ready", id: 0 });
    expect(native.writes.map((entry) => entry.kind)).toEqual(["watch", "watch"]);
    native.reply({ kind: "changed", id: 1, scope: "worktree" });
    expect(onA).not.toHaveBeenCalled();
    native.reply({ kind: "ready", id: 1 });
    native.reply({ kind: "ready", id: 2 });
    await Promise.all([a.ready, b.ready]);
    native.reply({ kind: "changed", id: 2, scope: "git" });
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledExactlyOnceWith("git");
    a.unsubscribe();
    expect(native.writes.at(-1)).toMatchObject({ kind: "unwatch", id: 1 });
    native.reply({ kind: "changed", id: 1, scope: "worktree" });
    expect(onA).not.toHaveBeenCalled();
  });

  it("uses fresh IDs for replacement and ignores old notifications before and after ACK", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const oldChanged = vi.fn<(scope: ProjectWatchScope) => void>(),
      nextChanged = vi.fn<(scope: ProjectWatchScope) => void>();
    const old = instance.watch("/old", oldChanged);
    old.unsubscribe();
    const replacement = instance.watch("/new", nextChanged);
    native.reply({ kind: "ready", id: 0 });
    expect(native.writes).toEqual([{ protocolVersion: 3, id: 2, kind: "watch", rootPath: "/new" }]);
    native.reply({ kind: "ready", id: 1 });
    native.reply({ kind: "changed", id: 1, scope: "git" });
    native.reply({ kind: "ready", id: 2 });
    await replacement.ready;
    native.reply({ kind: "changed", id: 1, scope: "worktree" });
    native.reply({ kind: "changed", id: 2, scope: "worktree" });
    expect(oldChanged).not.toHaveBeenCalled();
    expect(nextChanged).toHaveBeenCalledExactlyOnceWith("worktree");
    expect(mocks.spawn).toHaveBeenCalledOnce();
  });

  it("rejects the previous v2 helper and installs an off-supervisor fallback", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const changed = vi.fn<(scope: ProjectWatchScope) => void>();
    const subscription = instance.watch("/repo", changed);
    native.reply({ protocolVersion: 2, kind: "ready", id: 0 });
    expect(native.child.kill).toHaveBeenCalledOnce();
    expect(mocks.workers).toHaveLength(1);
    const worker = mocks.workers[0]!;
    workerReply(worker, { kind: "ready", id: 0 });
    expect(worker.postMessage).toHaveBeenCalledWith({
      protocolVersion: 3,
      kind: "watch",
      id: 1,
      rootPath: "/repo",
    });
    workerReply(worker, { kind: "ready", id: 1 });
    await subscription.ready;
    workerReply(worker, { kind: "changed", id: 1, scope: "worktree" });
    expect(changed).toHaveBeenCalledExactlyOnceWith("worktree");
    native.reply({ kind: "changed", id: 1, scope: "git" });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("falls back when a v2 executable refuses the new watch mode", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const subscription = instance.watch("/repo", vi.fn<(scope: ProjectWatchScope) => void>());
    native.child.emit("close", 2);
    const worker = mocks.workers[0]!;
    workerReply(worker, { kind: "ready", id: 0 });
    workerReply(worker, { kind: "ready", id: 1 });
    await subscription.ready;
    expect(mocks.spawn).toHaveBeenCalledOnce();
  });

  it("recovers every live scope after native failure and discards retired ones", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const onA = vi.fn<(scope: ProjectWatchScope) => void>(),
      onB = vi.fn<(scope: ProjectWatchScope) => void>();
    const a = instance.watch("/a", onA),
      b = instance.watch("/b", onB);
    native.reply({ kind: "ready", id: 0 });
    native.reply({ kind: "ready", id: 1 });
    native.reply({ kind: "ready", id: 2 });
    await Promise.all([a.ready, b.ready]);
    b.unsubscribe();
    native.child.emit("close", 1);
    const worker = mocks.workers[0]!;
    workerReply(worker, { kind: "ready", id: 0 });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    workerReply(worker, { kind: "ready", id: 1 });
    expect(onA.mock.calls).toEqual([["git"], ["worktree"]]);
    expect(onB).not.toHaveBeenCalled();
    await instance.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(mocks.workers).toHaveLength(1);
  });

  it("times out native startup once and does not leave a helper behind", async () => {
    vi.useFakeTimers();
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const subscription = instance.watch("/repo", vi.fn<(scope: ProjectWatchScope) => void>());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(native.child.kill).toHaveBeenCalledOnce();
    const worker = mocks.workers[0]!;
    workerReply(worker, { kind: "ready", id: 0 });
    workerReply(worker, { kind: "ready", id: 1 });
    await subscription.ready;
    expect(mocks.spawn).toHaveBeenCalledOnce();
  });

  it("uses the worker directly without a binary and stops after the final unwatch", async () => {
    const instance = client(false);
    const subscription = instance.watch("/repo", vi.fn<(scope: ProjectWatchScope) => void>());
    const worker = mocks.workers[0]!;
    workerReply(worker, { kind: "ready", id: 0 });
    workerReply(worker, { kind: "ready", id: 1 });
    await subscription.ready;
    subscription.unsubscribe();
    await Promise.resolve();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      protocolVersion: 3,
      kind: "unwatch",
      id: 1,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("tears down startup without allowing late readiness to recreate subscriptions", async () => {
    const native = childHarness();
    mocks.spawn.mockReturnValue(native.child);
    const instance = client();
    const subscription = instance.watch("/repo", vi.fn<(scope: ProjectWatchScope) => void>());
    await instance.dispose();
    await subscription.ready;
    native.reply({ kind: "ready", id: 0 });
    expect(native.writes).toEqual([]);
    expect(mocks.workers).toHaveLength(0);
  });
});
