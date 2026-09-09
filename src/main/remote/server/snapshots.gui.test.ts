import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteServerContext } from "./context";
import { buildThreadSnapshot } from "./snapshots";
import { dbGetThread } from "../../db";

vi.mock("../../db", () => ({
  dbGetThread: vi.fn<() => Thread | undefined>(),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  dbGetThreadTerminalScrollback: vi.fn<() => string>(() => "persisted history"),
}));

const thread: Thread = {
  id: "snapshot-gui",
  projectId: "project",
  title: "Chat",
  agentKind: "claude",
  config: { model: "default" },
  presentationMode: "gui",
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-09-09T00:00:00Z",
  updatedAt: "2026-09-09T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(dbGetThread).mockReturnValue(thread);
});

function context() {
  const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(async (method) => {
    if (method === "readTerminalScrollback") return "live terminal history";
    if (method === "readTerminalSize") return { cols: 80, rows: 24 };
    return [];
  });
  return {
    callSupervisor,
    ctx: {
      options: { callSupervisor },
      seq: 7,
      backgroundTasksByThread: new Map(),
    } as unknown as RemoteServerContext,
  };
}

describe("GUI snapshot supervisor reads", () => {
  it("reads only structured background work for a GUI chat and preserves persisted handoff history", async () => {
    const { ctx, callSupervisor } = context();
    const snapshot = await buildThreadSnapshot(ctx, thread.id);
    expect(callSupervisor.mock.calls.map(([method]) => method)).toEqual([
      "readThreadBackgroundTasks",
    ]);
    expect(snapshot.terminalScrollback).toBe("persisted history");
    expect(snapshot.terminalSize).toBeUndefined();
    expect(snapshot.thread.presentationMode).toBe("gui");
  });

  it("preserves live terminal reads for terminal presentation", async () => {
    vi.mocked(dbGetThread).mockReturnValue({ ...thread, presentationMode: "terminal" });
    const { ctx, callSupervisor } = context();
    const snapshot = await buildThreadSnapshot(ctx, thread.id);
    expect(callSupervisor).toHaveBeenCalledTimes(3);
    expect(snapshot.terminalScrollback).toBe("live terminal history");
    expect(snapshot.terminalSize).toEqual({ cols: 80, rows: 24 });
  });
});
