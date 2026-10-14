import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { groupThread, persistedGroupExperiment } from "@/shared/test/threadGroups";
import { dbGetState, dbGetThreads, dbUpsertThread } from "../../db";
import { assertRemoteThreadCommandExperimentSafe } from "../experimentOwnership";
import type { RemoteServerContext } from "./context";
import { applyRemoteThreadCommand } from "./threadCommands";

vi.mock("../../db", () => ({
  dbGetState: vi.fn<(key: string) => string | null>(() => null),
  dbGetThreads: vi.fn<() => Thread[]>(() => []),
  dbUpsertThread: vi.fn<typeof dbUpsertThread>(),
}));

function setup(threads: Thread[]) {
  vi.mocked(dbGetThreads).mockImplementation(() => threads);
  vi.mocked(dbUpsertThread).mockImplementation((row) => {
    threads[threads.findIndex((thread) => thread.id === row.id)] = row;
  });
  const emit = vi.fn<() => boolean>(() => true);
  const ctx = {
    options: { dispatchThreadCommand: emit },
    publishThreadsChanged: vi.fn<(threadIds: string[]) => void>(),
  } as unknown as RemoteServerContext;
  return { ctx, emit };
}

beforeEach(() => {
  vi.mocked(dbGetState).mockReturnValue(null);
});

describe("remote group commands", () => {
  it.each([undefined, "other-group"])(
    "rejects removing or reassigning persisted experiment members: %s",
    async (groupId) => {
      vi.mocked(dbGetState).mockReturnValue(persistedGroupExperiment());
      const threads = [groupThread("a", "experiment-1"), groupThread("b", "experiment-1")];
      const before = structuredClone(threads);
      const { ctx, emit } = setup(threads);
      for (const threadId of ["a", "b"]) {
        const command = { kind: "set-group" as const, threadId, ...(groupId ? { groupId } : {}) };
        expect(() => assertRemoteThreadCommandExperimentSafe(command)).toThrow(
          /Experiment candidates/,
        );
        await expect(applyRemoteThreadCommand(ctx, command)).rejects.toThrow(
          /Experiment candidates/,
        );
      }
      expect(dbUpsertThread).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(ctx.publishThreadsChanged).not.toHaveBeenCalled();
      expect(threads).toEqual(before);
    },
  );
  it("rejects admission to a persisted experiment", async () => {
    vi.mocked(dbGetState).mockReturnValue(persistedGroupExperiment());
    const { ctx, emit } = setup([groupThread("ordinary")]);
    const command = { kind: "set-group" as const, threadId: "ordinary", groupId: "experiment-1" };
    expect(() => assertRemoteThreadCommandExperimentSafe(command)).toThrow(/Experiment candidates/);
    await expect(applyRemoteThreadCommand(ctx, command)).rejects.toThrow(/Experiment candidates/);
    expect(dbUpsertThread).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
  it("fails closed on unreadable ownership", async () => {
    vi.mocked(dbGetState).mockReturnValue("invalid JSON");
    const { ctx } = setup([groupThread("a")]);
    await expect(
      applyRemoteThreadCommand(ctx, { kind: "set-group", threadId: "a" }),
    ).rejects.toThrow(/ownership could not be verified/);
    expect(dbUpsertThread).not.toHaveBeenCalled();
  });
  it.each([2, 3])(
    "ungroups one of %s members preserving pair dissolution and sort order",
    async (size) => {
      const threads = Array.from({ length: size }, (_, index) => groupThread(String(index)));
      const { ctx } = setup(threads);
      await expect(
        applyRemoteThreadCommand(ctx, { kind: "set-group", threadId: "0" }),
      ).resolves.toBe(false);
      expect(threads.map((thread) => thread.groupId)).toEqual(
        size === 2 ? [undefined, undefined] : [undefined, "group-1", "group-1"],
      );
      expect(dbUpsertThread).toHaveBeenCalledWith(expect.objectContaining({ id: "0" }), 0);
      expect(vi.mocked(dbUpsertThread).mock.calls.map(([row, order]) => [row.id, order])).toEqual(
        size === 2
          ? [
              ["0", 0],
              ["1", 1],
            ]
          : [["0", 0]],
      );
    },
  );
  it("dissolves a whole ordinary group via individual commands", async () => {
    const threads = [groupThread("a"), groupThread("b"), groupThread("c")];
    const { ctx } = setup(threads);
    for (const threadId of ["a", "b", "c"])
      await applyRemoteThreadCommand(ctx, { kind: "set-group", threadId });
    expect(
      threads.every((thread) => thread.groupId === undefined && thread.groupName === undefined),
    ).toBe(true);
  });
  it("reassigns an ordinary group", async () => {
    const threads = [groupThread("a")];
    const { ctx } = setup(threads);
    await applyRemoteThreadCommand(ctx, {
      kind: "set-group",
      threadId: "a",
      groupId: "new",
      groupName: "New group",
    });
    expect(threads[0]).toMatchObject({ groupId: "new", groupName: "New group" });
  });
});
