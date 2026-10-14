import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Query, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { ClaudeSdkSession } from "./sdkSession";

vi.mock("@/shared/awaitProcessTermination", () => ({
  awaitProcessTermination: vi.fn<typeof awaitProcessTermination>(),
}));

async function fixture() {
  const session = await ClaudeSdkSession.create({
    threadId: "worker",
    projectLocation: { kind: "posix", path: "/tmp/project" },
    config: { model: "sonnet" },
    presentationMode: "gui",
  });
  const internal = session as unknown as {
    queryRuntime: Query | undefined;
    queryReady: Promise<Query> | undefined;
    spawnedProcesses: Set<ChildProcess>;
    spawnTrackedProcess(spawn: () => SpawnedProcess, ownedProcessGroup?: boolean): SpawnedProcess;
  };
  const close = vi.fn<() => void>();
  const runtime = { close } as unknown as Query;
  internal.queryRuntime = runtime;
  const onClose = vi.fn<() => void>();
  session.setListener({ onClose, onError: () => {}, onUpdate: () => {} });
  const child = Object.assign(new EventEmitter(), {
    pid: 1234,
    killed: false,
    exitCode: null,
    signalCode: null,
  }) as unknown as ChildProcess;
  return { session, internal, runtime, close, onClose, child };
}

describe("Claude SDK confirmed disposal", () => {
  beforeEach(() => {
    vi.mocked(awaitProcessTermination).mockReset().mockResolvedValue(undefined);
  });

  it("shares disposal and preserves the query and child until termination is confirmed", async () => {
    const { session, internal, runtime, close, onClose, child } = await fixture();
    internal.spawnTrackedProcess(() => child as unknown as SpawnedProcess, true);
    const terminated = Promise.withResolvers<void>();
    vi.mocked(awaitProcessTermination).mockReturnValue(terminated.promise);
    const pending = session.dispose();
    expect(session.dispose()).toBe(pending);
    await vi.waitFor(() => expect(awaitProcessTermination).toHaveBeenCalledOnce());
    expect(awaitProcessTermination).toHaveBeenCalledWith(child, { ownedProcessGroup: true });
    expect(close).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(internal.queryRuntime).toBe(runtime);
    expect(internal.spawnedProcesses.has(child)).toBe(true);
    terminated.resolve();
    await pending;
    expect(internal.queryRuntime).toBeUndefined();
    expect(internal.spawnedProcesses.size).toBe(0);
    expect(onClose).toHaveBeenCalledOnce();
    expect(session.dispose()).toBe(pending);
  });

  it("retains failed children for a later disposal retry", async () => {
    const { session, internal, child, onClose } = await fixture();
    internal.spawnTrackedProcess(() => child as unknown as SpawnedProcess);
    vi.mocked(awaitProcessTermination).mockRejectedValueOnce(new Error("Process still alive"));
    await expect(session.dispose()).rejects.toThrow("Process still alive");
    expect(internal.spawnedProcesses.has(child)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await session.dispose();
    expect(awaitProcessTermination).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("still terminates captured children when query.close fails and retries query closure", async () => {
    const { session, internal, child, close } = await fixture();
    internal.spawnTrackedProcess(() => child as unknown as SpawnedProcess);
    close.mockImplementationOnce(() => {
      throw new Error("Query close failed");
    });
    await expect(session.dispose()).rejects.toThrow("Query close failed");
    expect(awaitProcessTermination).toHaveBeenCalledOnce();
    await session.dispose();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("waits for query creation before closing the late query", async () => {
    const { session, internal, runtime, close } = await fixture();
    const ready = Promise.withResolvers<Query>();
    internal.queryRuntime = undefined;
    internal.queryReady = ready.promise.then((query) => {
      internal.queryRuntime = query;
      return query;
    });
    const pending = session.dispose();
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();
    ready.resolve(runtime);
    await pending;
    expect(close).toHaveBeenCalledOnce();
  });

  it("includes a child captured during a synchronous disposal race and rejects later spawns", async () => {
    const { session, internal, child } = await fixture();
    const terminated = Promise.withResolvers<void>();
    vi.mocked(awaitProcessTermination).mockReturnValue(terminated.promise);
    let pending: Promise<void> | undefined;
    internal.spawnTrackedProcess(() => {
      pending = session.dispose();
      return child as unknown as SpawnedProcess;
    });
    await vi.waitFor(() => expect(awaitProcessTermination).toHaveBeenCalledOnce());
    expect(internal.spawnedProcesses.has(child)).toBe(true);
    const lateSpawn = vi.fn<() => SpawnedProcess>();
    expect(() => internal.spawnTrackedProcess(lateSpawn)).toThrow("cannot spawn after disposal");
    expect(lateSpawn).not.toHaveBeenCalled();
    terminated.resolve();
    await pending;
    expect(internal.spawnedProcesses.size).toBe(0);
  });

  it("retains an exited process-group leader until its descendants are confirmed stopped", async () => {
    const { session, internal, child } = await fixture();
    internal.spawnTrackedProcess(() => child as unknown as SpawnedProcess, true);
    child.emit("exit", 0, null);
    expect(internal.spawnedProcesses.has(child)).toBe(true);
    await session.dispose();
    expect(awaitProcessTermination).toHaveBeenCalledWith(child, { ownedProcessGroup: true });
  });
});
