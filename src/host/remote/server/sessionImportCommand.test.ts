import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteServerContext } from "./context";

const db = vi.hoisted(() => ({
  projects: new Set<string>(),
  threads: new Map<string, Thread>(),
  flush: vi.fn<(threadId: string) => Promise<void>>(async () => undefined),
  markPending: vi.fn<(threadId: string, createdAt: string) => void>(),
  clearPending: vi.fn<(threadId: string) => void>(),
  isPending: vi.fn<(threadId: string) => boolean>(() => false),
}));
vi.mock("@/host/db", () => ({
  dbGetProject: (id: string) => (db.projects.has(id) ? { id } : undefined),
  dbGetThread: (id: string) => db.threads.get(id),
  dbGetThreads: () => [...db.threads.values()],
  dbFlushThreadRuntimeWrites: db.flush,
  dbUpsertThread: (thread: Thread) => {
    db.threads.set(thread.id, thread);
  },
  dbDeleteThread: (id: string) => {
    db.threads.delete(id);
  },
}));
vi.mock("@/host/db/sessionImportJournal", () => ({
  markSessionImportPending: db.markPending,
  clearPendingSessionImport: db.clearPending,
  isSessionImportPending: db.isPending,
}));

const { importAppSession, importRemoteSession } = await import("./sessionImportCommand");

const command = {
  kind: "import-session" as const,
  threadId: "t-import",
  projectId: "p1",
  agentKind: "claude",
  model: "sonnet",
  title: "Fix the login form",
  path: "/home/user/.claude/projects/repo/session-1.jsonl",
  providerSessionId: "session-1",
};

function contextWith(callSupervisor: (...args: unknown[]) => Promise<unknown>) {
  return {
    options: { callSupervisor },
    publishThreadsChanged: vi.fn<(ids: readonly string[]) => void>(),
  } as unknown as RemoteServerContext;
}

const { kind: _kind, threadId: _threadId, ...toolInput } = command;

describe("host session import command", () => {
  beforeEach(() => {
    db.projects = new Set(["p1"]);
    db.threads = new Map();
    db.flush.mockReset().mockResolvedValue(undefined);
    db.markPending.mockClear();
    db.clearPending.mockClear();
    db.isPending.mockReset().mockReturnValue(false);
  });

  it("saves a resumable GUI thread, then replays the transcript into it", async () => {
    const callSupervisor = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {
      // The row must already exist when the supervisor emits runtime events.
      expect(db.threads.has("t-import")).toBe(true);
      return { messageCount: 3 };
    });
    await importRemoteSession(contextWith(callSupervisor), command);

    expect(db.markPending).toHaveBeenCalledWith(command.threadId, expect.any(String));
    expect(db.flush).toHaveBeenCalledExactlyOnceWith(command.threadId);
    expect(db.clearPending).toHaveBeenCalledExactlyOnceWith(command.threadId);
    expect(db.flush.mock.invocationCallOrder[0]).toBeLessThan(
      db.clearPending.mock.invocationCallOrder[0]!,
    );
    expect(callSupervisor).toHaveBeenCalledWith("importSessionTranscript", {
      threadId: "t-import",
      agentKind: "claude",
      path: command.path,
      providerSessionId: "session-1",
    });
    expect(db.threads.get("t-import")).toMatchObject({
      projectId: "p1",
      title: "Fix the login form",
      presentationMode: "gui",
      status: "inactive",
      canResumeWithConfig: true,
      sessionRef: { providerSessionId: "session-1" },
      config: { model: "sonnet", importedFrom: { path: command.path } },
    });
  });

  it("removes the row when the replay fails, so no half import remains", async () => {
    const failure = new Error("Transcript is outside the agent's session roots.");
    await expect(
      importRemoteSession(
        contextWith(async () => {
          throw failure;
        }),
        command,
      ),
    ).rejects.toBe(failure);
    expect(db.threads.has("t-import")).toBe(false);
  });

  it("rolls back instead of completing an import when the transcript prefix fails to flush", async () => {
    const failure = new Error("Runtime persistence refused its prefix");
    db.flush.mockRejectedValueOnce(failure);
    await expect(
      importAppSession(
        contextWith(async () => ({ messageCount: 1 })),
        toolInput,
      ),
    ).rejects.toBe(failure);
    expect(db.threads.size).toBe(0);
    expect(db.markPending).toHaveBeenCalledOnce();
    expect(db.clearPending).toHaveBeenCalledExactlyOnceWith(db.markPending.mock.calls[0]![0]);
  });

  it("reuses the settled import and publishes only the saved thread", async () => {
    const replay = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
      messageCount: 1,
    }));
    const host = contextWith(replay);
    const result = await importAppSession(host, toolInput);
    expect(result).toMatchObject({ projectId: "p1", outcome: "imported" });
    expect(db.threads.get(result.threadId)?.config.importedFrom?.path).toBe(command.path);
    await expect(importAppSession(host, toolInput)).resolves.toEqual({
      ...result,
      outcome: "existing",
    });
    expect(host.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith([result.threadId]);
    expect(replay).toHaveBeenCalledOnce();
  });

  it("joins a UI import and refuses a second UI write for the same source", async () => {
    const replay = Promise.withResolvers<unknown>();
    const callSupervisor = vi.fn<(...args: unknown[]) => Promise<unknown>>(() => replay.promise);
    const host = contextWith(callSupervisor);
    const ui = importRemoteSession(host, command);
    const mcp = importAppSession(host, toolInput);
    await expect(
      importRemoteSession(host, { ...command, threadId: "duplicate" }),
    ).rejects.toMatchObject({ code: "session_import_in_progress" });
    replay.resolve({ messageCount: 1 });
    await ui;
    await expect(mcp).resolves.toEqual({
      threadId: command.threadId,
      projectId: command.projectId,
      outcome: "existing",
    });
    expect(callSupervisor).toHaveBeenCalledOnce();
    expect(db.threads.size).toBe(1);
  });

  it("refuses an unknown project or an existing thread before any write", async () => {
    const callSupervisor = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
      messageCount: 0,
    }));
    await expect(
      importRemoteSession(contextWith(callSupervisor), { ...command, projectId: "missing" }),
    ).rejects.toMatchObject({ code: "project_not_found", status: 404 });

    const existing = { id: "t-import", title: "Mine" } as Thread;
    db.threads.set("t-import", existing);
    await expect(importRemoteSession(contextWith(callSupervisor), command)).rejects.toMatchObject({
      code: "thread_already_exists",
      status: 409,
    });
    expect(db.threads.get("t-import")).toBe(existing);
    expect(callSupervisor).not.toHaveBeenCalled();
  });
});
