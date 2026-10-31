import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteServerContext } from "./context";

const db = vi.hoisted(() => ({
  projects: new Set<string>(),
  threads: new Map<string, Thread>(),
}));
vi.mock("@/host/db", () => ({
  dbGetProject: (id: string) => (db.projects.has(id) ? { id } : undefined),
  dbGetThread: (id: string) => db.threads.get(id),
  dbUpsertThread: (thread: Thread) => {
    db.threads.set(thread.id, thread);
  },
  dbDeleteThread: (id: string) => {
    db.threads.delete(id);
  },
}));

const { importRemoteSession } = await import("./sessionImportCommand");

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
  return { options: { callSupervisor } } as unknown as RemoteServerContext;
}

describe("host session import command", () => {
  beforeEach(() => {
    db.projects = new Set(["p1"]);
    db.threads = new Map();
  });

  it("saves a resumable GUI thread, then replays the transcript into it", async () => {
    const callSupervisor = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {
      // The row must already exist when the supervisor emits runtime events.
      expect(db.threads.has("t-import")).toBe(true);
      return { messageCount: 3 };
    });
    await importRemoteSession(contextWith(callSupervisor), command);

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
