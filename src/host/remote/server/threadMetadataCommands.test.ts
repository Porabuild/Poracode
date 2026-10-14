// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  applyThreadMetadataCommand,
  threadMetadataClosesSession,
  type ThreadMetadataCommand,
} from "./threadMetadataCommands";

const NOW = "2026-09-20T12:00:00.000Z";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.6" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

describe("applyThreadMetadataCommand", () => {
  it("renames without touching updatedAt", () => {
    const next = applyThreadMetadataCommand(
      makeThread(),
      { kind: "rename", threadId: "t", title: "Renamed" },
      NOW,
    );
    expect(next).toMatchObject({ title: "Renamed", updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("only clears a finished thread's marker when acknowledging", () => {
    const finished = applyThreadMetadataCommand(
      makeThread({ status: "finished" }),
      { kind: "acknowledge", threadId: "t" },
      NOW,
    );
    expect(finished.status).toBe("idle");

    const working = applyThreadMetadataCommand(
      makeThread({ status: "working" }),
      { kind: "acknowledge", threadId: "t" },
      NOW,
    );
    expect(working.status).toBe("working");
  });

  it("marks done with the stamp and clears starred, and un-done clears doneAt", () => {
    const done = applyThreadMetadataCommand(
      makeThread({ starred: true }),
      { kind: "set-done", threadId: "t", done: true },
      NOW,
    );
    expect(done).toMatchObject({ done: true, doneAt: NOW, starred: false });

    const reopened = applyThreadMetadataCommand(
      makeThread({ done: true, doneAt: NOW }),
      { kind: "set-done", threadId: "t", done: false },
      NOW,
    );
    expect(reopened.done).toBe(false);
    expect(reopened.doneAt).toBeUndefined();
  });

  it("sets starred and group fields", () => {
    const starred = applyThreadMetadataCommand(
      makeThread(),
      { kind: "set-starred", threadId: "t", starred: true },
      NOW,
    );
    expect(starred.starred).toBe(true);

    const grouped = applyThreadMetadataCommand(
      makeThread(),
      { kind: "set-group", threadId: "t", groupId: "g", groupName: "Group" },
      NOW,
    );
    expect(grouped).toMatchObject({ groupId: "g", groupName: "Group" });
  });

  it("strips both group fields when clearing a group", () => {
    const cleared = applyThreadMetadataCommand(
      makeThread({ groupId: "g", groupName: "Group" }),
      { kind: "clear-group", threadId: "t" },
      NOW,
    );
    expect(cleared.groupId).toBeUndefined();
    expect(cleared.groupName).toBeUndefined();
  });

  it("stamps archive and unarchive consistently", () => {
    const archived = applyThreadMetadataCommand(
      makeThread(),
      { kind: "archive", threadId: "t" },
      NOW,
    );
    expect(archived).toMatchObject({ archived: true, archivedAt: NOW, updatedAt: NOW });

    const restored = applyThreadMetadataCommand(
      makeThread({ archived: true, archivedAt: NOW }),
      { kind: "unarchive", threadId: "t" },
      NOW,
    );
    expect(restored.archived).toBe(false);
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.updatedAt).toBe(NOW);
  });
});

describe("threadMetadataClosesSession", () => {
  it.each<[ThreadMetadataCommand, boolean]>([
    [{ kind: "set-done", threadId: "t", done: true }, true],
    [{ kind: "archive", threadId: "t" }, true],
    [{ kind: "set-done", threadId: "t", done: false }, false],
    [{ kind: "unarchive", threadId: "t" }, false],
    [{ kind: "rename", threadId: "t", title: "x" }, false],
    [{ kind: "acknowledge", threadId: "t" }, false],
  ])("reports lifecycle ownership for %j", (command, expected) => {
    expect(threadMetadataClosesSession(command)).toBe(expected);
  });
});
