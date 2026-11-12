import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWatchSubscription } from "./projectWatcherWorkerRuntime";
import type { ProjectWatchEvent } from "./projectWatcherProtocol";

const fs = vi.hoisted(() => ({
  watch:
    vi.fn<
      (
        path: string,
        options: unknown,
        callback: (event: string, filename: string | null) => void,
      ) => EventEmitter & { close: ReturnType<typeof vi.fn<() => void>> }
    >(),
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
  statSync: vi.fn<(path: string) => { isDirectory: () => boolean; isFile: () => boolean }>(),
}));
vi.mock("node:fs", () => fs);

const root = resolve("tmp/watcher-unit/repo");
const gitDir = join(root, ".git");
const metadata = resolve("tmp/watcher-unit/main/.git/worktrees/topic");
const common = resolve(metadata, "../..");
let callbacks: Map<string, (event: string, filename: string | null) => void>;
let handles: Map<string, EventEmitter & { close: ReturnType<typeof vi.fn> }>;
let files: Map<string, string>;
let directories: Set<string>;
const subscriptions: ProjectWatchSubscription[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  callbacks = new Map();
  handles = new Map();
  files = new Map();
  directories = new Set();
  fs.watch
    .mockReset()
    .mockImplementation(
      (
        path: string,
        _options: unknown,
        callback: (event: string, filename: string | null) => void,
      ) => {
        const handle = Object.assign(new EventEmitter(), { close: vi.fn<() => void>() });
        callbacks.set(path, callback);
        handles.set(path, handle);
        return handle;
      },
    );
  fs.statSync.mockReset().mockImplementation((path: string) => {
    if (!directories.has(path) && !files.has(path)) throw new Error("ENOENT");
    return { isDirectory: () => directories.has(path), isFile: () => files.has(path) };
  });
  fs.readFileSync.mockReset().mockImplementation((path: string) => {
    if (!files.has(path)) throw new Error("ENOENT");
    return files.get(path)!;
  });
});
afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.close();
  vi.useRealTimers();
});

function start() {
  const emit = vi.fn<(event: ProjectWatchEvent) => void>();
  const subscription = new ProjectWatchSubscription(7, root, emit);
  subscriptions.push(subscription);
  subscription.start();
  return { emit, subscription };
}
function change(path: string, name: string | null) {
  callbacks.get(path)!("change", name);
}

describe("worker filesystem callback ownership", () => {
  it("filters noise callbacks before creating bounded scope timers", async () => {
    const { emit } = start();
    for (let i = 0; i < 1000; i++) {
      for (const name of [
        "node_modules/react/index.js",
        ".poracode/worktrees/topic/src/app.ts",
        "packages/a/node_modules/index.js",
        "native/a/target/debug/lib.rmeta",
        ".git/index.lock",
        ".git/objects/aa/object",
        ".git/worktrees/topic/index",
      ])
        change(root, name);
    }
    expect(vi.getTimerCount()).toBe(0);
    for (let i = 0; i < 1000; i++) {
      change(root, "src/app.ts");
      change(root, ".git/refs/heads/main");
    }
    expect(vi.getTimerCount()).toBe(2);
    expect(emit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299);
    expect(emit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      { id: 7, kind: "changed", scope: "worktree" },
      { id: 7, kind: "changed", scope: "git" },
    ]);
  });

  it("invalidates both scopes and discovers metadata after pathless root events", async () => {
    const { emit } = start();
    files.set(gitDir, `gitdir: ${metadata}\n`);
    files.set(join(metadata, "commondir"), "../..\n");
    for (let i = 0; i < 1000; i++) change(root, null);
    expect([...handles.keys()]).toEqual([root, metadata, common]);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      { id: 7, kind: "changed", scope: "git" },
      { id: 7, kind: "changed", scope: "worktree" },
    ]);
  });

  it("invalidates Git and replaces metadata after pathless metadata events", async () => {
    files.set(gitDir, `gitdir: ${metadata}\n`);
    files.set(join(metadata, "commondir"), "../..\n");
    const { emit } = start();
    const replacement = resolve("tmp/watcher-unit/replacement");
    files.set(join(metadata, "commondir"), replacement);
    change(metadata, null);
    expect(handles.get(common)?.close).toHaveBeenCalledOnce();
    expect(handles.has(replacement)).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).toHaveBeenCalledExactlyOnceWith({ id: 7, kind: "changed", scope: "git" });
  });

  it("observes late .git creation without treating Git directory mtime churn as changes", async () => {
    const { emit } = start();
    directories.add(gitDir);
    change(root, ".git");
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).toHaveBeenCalledExactlyOnceWith({ id: 7, kind: "changed", scope: "git" });
    emit.mockClear();
    change(root, ".git");
    change(root, ".git/index.lock");
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).not.toHaveBeenCalled();
    change(root, ".git/HEAD");
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).toHaveBeenCalledExactlyOnceWith({ id: 7, kind: "changed", scope: "git" });
  });

  it("watches linked worktree metadata and shared refs with the same filters", async () => {
    files.set(gitDir, `gitdir: ${metadata}\n`);
    files.set(join(metadata, "commondir"), "../..\n");
    const { emit } = start();
    expect([...handles.keys()]).toEqual([root, metadata, common]);
    change(metadata, "HEAD");
    change(common, "refs/heads/main");
    change(metadata, "index.lock");
    change(common, "worktrees/sibling/HEAD");
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).toHaveBeenCalledExactlyOnceWith({ id: 7, kind: "changed", scope: "git" });
    emit.mockClear();
    change(common, "worktrees/sibling/HEAD");
    change(metadata, "logs/HEAD");
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).not.toHaveBeenCalled();
  });

  it("replaces linked metadata watchers when the .git pointer changes", async () => {
    files.set(gitDir, `gitdir: ${metadata}\n`);
    const { subscription } = start();
    const oldHandle = handles.get(metadata)!;
    const replacement = resolve("tmp/watcher-unit/new/.git/worktrees/topic");
    files.set(gitDir, `gitdir: ${replacement}\n`);
    change(root, ".git");
    expect(oldHandle.close).toHaveBeenCalledOnce();
    expect(handles.has(replacement)).toBe(true);
    oldHandle.emit("error", new Error("late retired watcher error"));
    expect(handles.get(replacement)?.close).not.toHaveBeenCalled();
    subscription.close();
    expect(handles.get(replacement)?.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects initial metadata registration failure instead of reporting a dead watcher ready", () => {
    files.set(gitDir, `gitdir: ${metadata}\n`);
    fs.watch
      .mockImplementationOnce((_path, _options, callback) => {
        const handle = Object.assign(new EventEmitter(), { close: vi.fn<() => void>() });
        callbacks.set(root, callback);
        handles.set(root, handle);
        return handle;
      })
      .mockImplementationOnce(() => {
        throw new Error("metadata unavailable");
      });
    const emit = vi.fn<(event: ProjectWatchEvent) => void>();
    const subscription = new ProjectWatchSubscription(7, root, emit);
    subscriptions.push(subscription);
    expect(() => subscription.start()).toThrow("metadata unavailable");
    subscription.close();
    expect(handles.get(root)?.close).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
  });

  it("clears all pending notifications and handles on unwatch or watcher error", async () => {
    const { emit, subscription } = start();
    change(root, "src/app.ts");
    subscription.close();
    change(root, "src/late.ts");
    await vi.advanceTimersByTimeAsync(300);
    expect(emit).not.toHaveBeenCalled();
    const second = start();
    change(root, "src/app.ts");
    handles.get(root)!.emit("error", new Error("watcher stopped"));
    await vi.advanceTimersByTimeAsync(300);
    expect(second.emit).toHaveBeenCalledExactlyOnceWith({
      id: 7,
      kind: "error",
      error: "Error: watcher stopped",
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(handles.get(root)?.close).toHaveBeenCalledOnce();
  });
});
