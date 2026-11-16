import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv } from "@/host/db/runtimeItems.testFixtures";
import { setMemorySettingsReader } from "./settingsReader";
import {
  handleMemoryCommand,
  installMemoryDeleteHook,
  launchMemoryInstructions,
  runMemoryCapturePass,
} from "./runtime";
import { defaultMemorySettings } from "@/shared/memory";
import type { Thread } from "@/shared/contracts";

const thread = (id: string): Thread =>
  ({
    id,
    projectId: "project-1",
    title: "Memory",
    agentKind: "claude",
    config: { model: "haiku" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: true,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:00:00.000Z",
    lastTurnEndedAt: "2026-11-16T00:00:00.000Z",
  }) as Thread;

describe("memory store", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-memory-"));
    initDatabase(join(dir, "state.sqlite"));
    setMemorySettingsReader(() => defaultMemorySettings);
    installMemoryDeleteHook();
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("fast-tracks an explicit preference and injects it", async () => {
    dbUpsertThread(thread("thread-1"), 0);
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
         VALUES ('thread-1', 'item-1', 0, 'user_message', 'completed', ?)`,
      )
      .run(JSON.stringify({ text: "Always use bun" }));

    const report = await runMemoryCapturePass(Date.parse("2026-11-16T00:05:00.000Z"));
    expect(report.captured).toBe(1);
    const listed = await handleMemoryCommand({ action: "list" });
    expect(listed).toEqual([
      expect.objectContaining({ summary: "Always use bun", lockedByUser: false }),
    ]);
    expect(launchMemoryInstructions("thread-1", "project-1")).toContain("Always use bun");
  });

  it("spools a transcript before the thread row disappears", async () => {
    dbUpsertThread(thread("thread-2"), 0);
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
         VALUES ('thread-2', 'item-1', 0, 'user_message', 'completed', ?)`,
      )
      .run(JSON.stringify({ text: "Never mock sqlite" }));
    const { dbDeleteThread } = await import("@/host/db/projectsThreads");
    dbDeleteThread("thread-2");
    expect(getSqlite().prepare("SELECT text FROM memory_capture_spool").all()).toEqual([
      expect.objectContaining({ text: expect.stringContaining("Never mock sqlite") }),
    ]);
    await runMemoryCapturePass();
    const listed = (await handleMemoryCommand({ action: "list" })) as Array<{ summary: string }>;
    expect(listed.some((entry) => entry.summary.includes("Never mock sqlite"))).toBe(true);
  });

  it("keeps a user edit locked and suggests a repeated skill", async () => {
    await handleMemoryCommand({
      action: "save",
      entry: {
        scope: "global",
        category: "user",
        summary: "Always use bun",
        body: "Always use bun",
        polarity: "positive",
        pinned: true,
      },
    });
    const { dreamMemories } = await import("./apply");
    const { dbInsertMemoryCandidate } = await import("@/host/db/memoryStore");
    for (let index = 0; index < 3; index += 1) {
      dbInsertMemoryCandidate({
        id: `c-${index}`,
        threadId: null,
        projectId: null,
        scope: "global",
        category: "feedback",
        statement: "Run the migration check before committing",
        quote: null,
        polarity: "positive",
        confidence: 0.5,
        explicit: false,
        status: "pending",
        createdAt: "2026-11-16T00:00:00.000Z",
      });
    }
    const outcome = dreamMemories(defaultMemorySettings, "2026-11-16T01:00:00.000Z");
    expect(outcome.suggested).toBe(1);
    const suggestions = await handleMemoryCommand({ action: "suggestions" });
    expect(suggestions).toEqual([expect.objectContaining({ status: "suggested" })]);
    const saved = (await handleMemoryCommand({ action: "list" })) as Array<{
      summary: string;
      lockedByUser: boolean;
    }>;
    expect(saved.find((item) => item.summary === "Always use bun")?.lockedByUser).toBe(true);
  });
});
