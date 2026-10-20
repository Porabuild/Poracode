import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbGetThreadCompletedTurns,
  dbReplaceThreadRuntimeItems,
} from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { persistThreadStateEvent } from "./threadStatePersistence";

const reference = { providerSessionId: "native-session", discoveredAt: "2026-10-07T10:00:00Z" };
const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Fixture",
  agentKind: "fixture",
  config: { model: "model" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  sessionRef: reference,
  presentationMode: "gui",
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-10-07T10:00:00Z",
  updatedAt: "2026-10-07T10:00:00Z",
};

describe.skipIf(!sqliteAvailable)("durable thread execution scope", () => {
  let directory: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-reference-upgrade-"));
    initDatabase(join(directory, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Fixture",
        location: { kind: "posix", path: "/fixture" },
        createdAt: thread.createdAt,
      },
      0,
    );
    dbUpsertThread(thread, 0);
  });
  afterEach(() => {
    vi.useRealTimers();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("persists a fast reply's fork boundary", async () => {
    await dbReplaceThreadRuntimeItems(thread.id, [
      {
        id: "reply",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Done" },
      },
    ]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
    persistThreadStateEvent({
      type: "thread-state",
      threadId: thread.id,
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });
    vi.setSystemTime(new Date("2026-10-07T10:00:00.400Z"));
    persistThreadStateEvent({
      type: "thread-state",
      threadId: thread.id,
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
    });
    expect(dbGetThreadCompletedTurns(thread.id)).toEqual([
      {
        startedAt: "2026-10-07T10:00:00.000Z",
        endedAt: "2026-10-07T10:00:00.400Z",
        anchorItemId: "reply",
      },
    ]);
  });

  it("anchors successive completed turns after their buffered replies commit", () => {
    vi.useFakeTimers();
    for (const index of [1, 2]) {
      vi.setSystemTime(new Date(`2026-10-07T10:0${index}:00Z`));
      persistThreadStateEvent({
        type: "thread-state",
        threadId: thread.id,
        status: "working",
        attention: "working",
        canResumeWithConfig: true,
      });
      dbApplyThreadRuntimeEvents(thread.id, [
        {
          type: "item.started",
          threadId: thread.id,
          itemId: `reply-${index}`,
          itemType: "assistant_message",
        },
        {
          type: "content.delta",
          threadId: thread.id,
          itemId: `reply-${index}`,
          stream: "assistant_text",
          delta: `Reply ${index}`,
        },
        { type: "item.completed", threadId: thread.id, itemId: `reply-${index}` },
      ]);
      vi.setSystemTime(new Date(`2026-10-07T10:0${index}:00.400Z`));
      persistThreadStateEvent({
        type: "thread-state",
        threadId: thread.id,
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
      });
    }
    expect(dbGetThreadCompletedTurns(thread.id).map((turn) => turn.anchorItemId)).toEqual([
      "reply-1",
      "reply-2",
    ]);
  });

  it("adds opaque metadata to an existing session and preserves it after reopening SQLite", () => {
    const bound = { ...reference, executionIdentity: "opaque-account-scope" };
    persistThreadStateEvent({
      type: "thread-state",
      threadId: thread.id,
      agentKind: thread.agentKind,
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      sessionRef: bound,
    });
    expect(dbGetThread(thread.id)?.sessionRef).toEqual(bound);
    closeDatabase();
    initDatabase(join(directory, "state.sqlite"));
    expect(dbGetThread(thread.id)?.sessionRef).toEqual(bound);
  });

  it("rejects metadata from the provider generation the thread already left", () => {
    persistThreadStateEvent({
      type: "thread-state",
      threadId: thread.id,
      agentKind: "retired-fixture",
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      sessionRef: { ...reference, executionIdentity: "foreign-scope" },
    });
    expect(dbGetThread(thread.id)?.sessionRef).toEqual(reference);
  });
});
