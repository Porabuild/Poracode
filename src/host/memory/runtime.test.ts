import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv } from "@/host/db/runtimeItems.testFixtures";
import { setMemoryRepoKeyReader } from "./repoKeyReader";
import { setMemorySettingsReader } from "./settingsReader";
import {
  handleMemoryCommand,
  installMemoryDeleteHook,
  prepareLaunchMemory,
  recordMemoryUsage,
  runMemoryCapturePass,
} from "./runtime";
import { defaultMemorySettings } from "@/shared/memory";
import type { Thread } from "@/shared/contracts";

const launchMemoryInstructions = (threadId: string | undefined, projectId: string | undefined) =>
  prepareLaunchMemory(threadId, projectId)?.instructions;

const thread = (id: string, patch: Partial<Thread> = {}): Thread =>
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
    ...patch,
  }) as Thread;

describe("memory store", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-memory-"));
    initDatabase(join(dir, "state.sqlite"));
    setMemorySettingsReader(() => ({ ...defaultMemorySettings, enabled: true }));
    setMemoryRepoKeyReader(undefined);
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

  it("waits for an idle turn to settle before capturing", async () => {
    dbUpsertThread(thread("thread-settle", { done: false, status: "idle" }), 0);
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
         VALUES ('thread-settle', 'item-1', 0, 'user_message', 'completed', ?)`,
      )
      .run(JSON.stringify({ text: "Always use bun" }));
    const tooSoon = await runMemoryCapturePass(Date.parse("2026-11-16T00:01:00.000Z"));
    expect(tooSoon.captured).toBe(0);
    const settled = await runMemoryCapturePass(Date.parse("2026-11-16T00:03:00.000Z"));
    expect(settled.captured).toBe(1);
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

  it("runs the dream model when available and cleanly undoes promotions and suggestions", async () => {
    const { setMemoryModelCaller } = await import("./runtime");
    const { dbInsertMemoryCandidate } = await import("@/host/db/memoryStore");
    const calls: string[] = [];
    setMemoryModelCaller({
      complete: async (input) => {
        calls.push(input.purpose);
        return JSON.stringify({
          observations: [
            {
              scope: "global",
              category: "feedback",
              statement: "Keep PR summaries concise",
              quote: null,
              polarity: "positive",
              explicit: true,
            },
          ],
        });
      },
    });
    try {
      for (let index = 0; index < 3; index += 1) {
        dbInsertMemoryCandidate({
          id: `dream-c-${index}`,
          threadId: null,
          projectId: null,
          scope: "global",
          category: "feedback",
          statement: "Keep PR summaries concise",
          quote: null,
          polarity: "positive",
          confidence: 0.5,
          explicit: false,
          status: "pending",
          createdAt: "2026-11-16T00:00:00.000Z",
        });
      }
      const result = (await handleMemoryCommand({ action: "dream" })) as {
        report: string;
        runId: string;
      };
      expect(calls).toEqual(["dream"]);
      expect(
        ((await handleMemoryCommand({ action: "list" })) as Array<{ summary: string }>).some(
          (item) => item.summary === "Keep PR summaries concise",
        ),
      ).toBe(true);
      expect(await handleMemoryCommand({ action: "suggestions" })).toHaveLength(1);
      await handleMemoryCommand({ action: "undo", runId: result.runId });
      expect(await handleMemoryCommand({ action: "list" })).toEqual([]);
      expect(await handleMemoryCommand({ action: "suggestions" })).toEqual([]);
    } finally {
      setMemoryModelCaller(undefined);
    }
  });

  it("isolates project memories from other projects and home threads", async () => {
    const { memorySearch } = await import("./runtime");
    const { memoryTools } = await import("@/host/app-controls/mcp/tools/memory");
    await handleMemoryCommand({
      action: "save",
      entry: {
        scope: "global",
        category: "user",
        summary: "Always use concise commit messages",
        body: "Always use concise commit messages",
        polarity: "positive",
        pinned: false,
      },
    });
    await handleMemoryCommand({
      action: "save",
      entry: {
        scope: "project",
        projectId: "project-1",
        category: "project",
        summary: "Project 1 uses an event-sourced ledger",
        body: "Project 1 uses an event-sourced ledger",
        polarity: "fact",
        pinned: false,
      },
    });

    const p1Launch = launchMemoryInstructions(undefined, "project-1");
    const p2Launch = launchMemoryInstructions(undefined, "project-2");
    const homeLaunch = launchMemoryInstructions(undefined, undefined);

    expect(p1Launch).toContain("Always use concise commit messages");
    expect(p1Launch).toContain("Project 1 uses an event-sourced ledger");
    expect(p2Launch).toContain("Always use concise commit messages");
    expect(p2Launch).not.toContain("Project 1 uses an event-sourced ledger");
    expect(homeLaunch).toContain("Always use concise commit messages");
    expect(homeLaunch).not.toContain("Project 1 uses an event-sourced ledger");

    expect(memorySearch("ledger", "project-1")).toHaveLength(1);
    expect(memorySearch("ledger", "project-2")).toHaveLength(0);
    expect(memorySearch("ledger", undefined)).toHaveLength(0);

    const caller = thread("search-caller", { projectId: "project-2" });
    const context = {
      identity: { threadId: caller.id },
      getThread: () => caller,
      deviceWorkspace: { authorizeAgent: () => {} },
    } as unknown as Parameters<(typeof memoryTools.handlers)[string]>[1];
    const search = memoryTools.handlers.search_memory!;
    await expect(search({ query: "ledger", projectId: "project-1" }, context)).rejects.toThrow(
      "calling thread's project",
    );
    await expect(search({ query: "concise" }, context)).resolves.toEqual({
      entries: [expect.objectContaining({ scope: "global" })],
    });
    await expect(search({ query: "ledger" }, context)).resolves.toEqual({ entries: [] });
  });

  it("rejects a Dream observation that pairs a project with another project's repository", async () => {
    const { dreamMemories } = await import("./apply");
    const repoKey = "github.com/acme/project-1";
    setMemoryRepoKeyReader((id) => `github.com/acme/${id}`);
    for (const projectId of ["project-1", "project-2"]) {
      await handleMemoryCommand({
        action: "save",
        entry: {
          scope: "project",
          projectId,
          category: "project",
          summary: `Architecture of ${projectId}`,
          body: `Architecture of ${projectId}`,
          polarity: "fact",
          pinned: false,
        },
      });
    }
    const latest = dreamMemories(defaultMemorySettings, "2026-11-17T01:00:00.000Z", [
      {
        scope: "project",
        projectId: "project-2",
        repoKey,
        category: "project",
        statement: "Wrong project architecture",
        polarity: "fact",
        quote: null,
        explicit: true,
      },
    ]);
    expect(latest.promoted).toBe(0);
    for (const projectId of ["project-1", "project-2"]) {
      expect(launchMemoryInstructions(undefined, projectId)).not.toContain(
        "Wrong project architecture",
      );
    }
  });

  it("stays opt-in by default (no capture, spool, or injection when disabled)", async () => {
    setMemorySettingsReader(() => defaultMemorySettings);
    expect(defaultMemorySettings.enabled).toBe(false);
    dbUpsertThread(thread("thread-off"), 0);
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
         VALUES ('thread-off', 'item-1', 0, 'user_message', 'completed', ?)`,
      )
      .run(JSON.stringify({ text: "Always use bun" }));

    expect(await runMemoryCapturePass()).toEqual({ captured: 0, spooled: 0 });
    const { dbDeleteThread } = await import("@/host/db/projectsThreads");
    dbDeleteThread("thread-off");
    expect(getSqlite().prepare("SELECT text FROM memory_capture_spool").all()).toEqual([]);
    expect(launchMemoryInstructions("thread-off", "project-1")).toBeUndefined();
  });

  it("shares project memories across environments with the same repoKey while syncing tombstones", async () => {
    dbUpsertProject(
      {
        id: "project-wsl",
        name: "Test WSL",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/test",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\test",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      1,
    );
    dbUpsertProject(
      {
        id: "project-unrelated",
        name: "Other",
        location: { kind: "posix", path: "/tmp/other" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      2,
    );
    setMemoryRepoKeyReader((projectId) =>
      projectId === "project-1" || projectId === "project-wsl" ? "github.com/acme/repo" : null,
    );

    const saved = (await handleMemoryCommand({
      action: "save",
      entry: {
        scope: "project",
        projectId: "project-1",
        category: "project",
        summary: "Uses bun test runner",
        body: "Uses bun test runner",
        polarity: "fact",
        pinned: false,
      },
    })) as { id: string; repoKey?: string | null };
    expect(saved.repoKey).toBe("github.com/acme/repo");

    // Local Windows + WSL environments sharing the same verified repoKey share project memories.
    expect(launchMemoryInstructions(undefined, "project-wsl")).toContain("Uses bun test runner");
    expect(launchMemoryInstructions(undefined, "project-unrelated")).toBeUndefined();

    // Unlinked local project memories never leave this host during sync-export.
    await handleMemoryCommand({
      action: "save",
      entry: {
        scope: "project",
        projectId: "project-unrelated",
        category: "project",
        summary: "Unlinked local secret convention",
        body: "Unlinked local secret convention",
        polarity: "fact",
        pinned: false,
      },
    });
    const exported = (await handleMemoryCommand({ action: "sync-export" })) as {
      entries: Array<{ summary: string; id: string }>;
      tombstones: unknown[];
    };
    expect(exported.entries.map((entry) => entry.summary)).toEqual(["Uses bun test runner"]);

    // Incoming global + peer project entries merge, and tombstones delete stale entries.
    const merged = (await handleMemoryCommand({
      action: "sync-merge",
      state: {
        entries: [
          {
            id: "peer-global-1",
            scope: "global",
            projectId: null,
            repoKey: null,
            category: "user",
            summary: "Prefer short answers",
            body: "Prefer short answers",
            confidence: 0.9,
            polarity: "positive",
            quote: null,
            lockedByUser: false,
            pinned: false,
            archived: false,
            usageCount: 0,
            lastUsedAt: null,
            createdAt: "2026-11-17T00:00:00.000Z",
            updatedAt: "2026-11-17T00:00:00.000Z",
            source: "user",
          },
          {
            id: "peer-proj-1",
            scope: "project",
            projectId: "remote-id-123",
            repoKey: "github.com/acme/repo",
            category: "project",
            summary: "Linux CI uses Ubuntu 24",
            body: "Linux CI uses Ubuntu 24",
            confidence: 0.9,
            polarity: "fact",
            quote: null,
            lockedByUser: false,
            pinned: false,
            archived: false,
            usageCount: 0,
            lastUsedAt: null,
            createdAt: "2026-11-17T00:00:00.000Z",
            updatedAt: "2026-11-17T00:00:00.000Z",
            source: "learned",
          },
        ],
        tombstones: [
          {
            id: saved.id,
            scope: "project",
            projectId: null,
            repoKey: "github.com/acme/repo",
            deletedAt: "2099-01-01T00:00:00.000Z",
          },
        ],
      },
    })) as { synced: boolean; changed: boolean };

    expect(merged.synced).toBe(true);
    expect(merged.changed).toBe(true);
    const wslPrompt = launchMemoryInstructions(undefined, "project-wsl");
    expect(wslPrompt).toContain("Prefer short answers");
    expect(wslPrompt).toContain("Linux CI uses Ubuntu 24");
    expect(wslPrompt).not.toContain("Uses bun test runner");
  });

  it("skips pre-opt-in historical turns behind captureCutoffAt while capturing newer ones", async () => {
    const { dbSetMemoryMeta } = await import("@/host/db/memoryStore");
    dbSetMemoryMeta("captureCutoffAt", "2026-11-17T00:00:00.000Z");
    dbUpsertThread(
      thread("thread-old", {
        done: true,
        lastTurnEndedAt: "2026-11-16T23:59:00.000Z",
        updatedAt: "2026-11-16T23:59:00.000Z",
      }),
      0,
    );
    dbUpsertThread(
      thread("thread-new", {
        done: true,
        lastTurnEndedAt: "2026-11-17T00:01:00.000Z",
        updatedAt: "2026-11-17T00:01:00.000Z",
      }),
      1,
    );
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
         VALUES ('thread-old', 'item-old', 0, 'user_message', 'completed', ?),
                ('thread-new', 'item-new', 0, 'user_message', 'completed', ?)`,
      )
      .run(
        JSON.stringify({ text: "Always ignore legacy" }),
        JSON.stringify({ text: "Always use fresh rules" }),
      );

    const report = await runMemoryCapturePass(Date.parse("2026-11-17T00:05:00.000Z"));
    expect(report.captured).toBe(1);
    const listed = (await handleMemoryCommand({ action: "list" })) as Array<{ summary: string }>;
    expect(listed.map((entry) => entry.summary)).toEqual(["Always use fresh rules"]);
  });

  it("retains the opt-in boundary on restart when an old thread gets another turn", async () => {
    const { dbStartMemoryCapture } = await import("@/host/db/memoryStore");
    const threadId = "thread-resumed";
    dbUpsertThread(thread(threadId), 0);
    const insertMessage = (position: number, text: string) =>
      getSqlite()
        .prepare(
          `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
           VALUES (?, ?, ?, 'user_message', 'completed', ?)`,
        )
        .run(threadId, `u${position}`, position, JSON.stringify({ text }));
    insertMessage(0, "Always ignore legacy rules");
    dbStartMemoryCapture("2026-11-17T00:00:00.000Z");
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertThread(thread(threadId, { lastTurnEndedAt: "2026-11-17T00:01:00.000Z" }), 0);
    insertMessage(1, "Always use fresh rules");
    await runMemoryCapturePass(Date.parse("2026-11-17T00:05:00.000Z"));
    expect(await handleMemoryCommand({ action: "list" })).toEqual([
      expect.objectContaining({ summary: "Always use fresh rules" }),
    ]);
  });

  it("hydrates streamed assistant replies and uses the capture model on subtle/multi-rule turns", async () => {
    const { setMemoryModelCaller } = await import("./runtime");
    const prompts: string[] = [];
    setMemoryModelCaller({
      complete: async (input) => {
        prompts.push(input.prompt);
        return JSON.stringify({
          observations: [
            {
              scope: "project",
              category: "project",
              statement: "Staging server listens on port 4180",
              quote: "staging server listens on port 4180",
              polarity: "fact",
              explicit: true,
            },
            {
              scope: "global",
              category: "feedback",
              statement: "Start PR feedback with the root cause",
              quote: "start with the root cause",
              polarity: "positive",
              explicit: true,
            },
          ],
        });
      },
    });
    try {
      const { writeItemStreams } = await import("@/host/db/runtimeStreamStore");
      dbUpsertThread(thread("thread-stream"), 0);
      getSqlite()
        .prepare(
          `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
           VALUES ('thread-stream', 'u1', 0, 'user_message', 'completed', ?),
                  ('thread-stream', 'a1', 1, 'assistant_message', 'completed', NULL)`,
        )
        .run(
          JSON.stringify({
            text: "For context, our staging server listens on port 4180. Also always start PR feedback with the root cause. Do not run tools.",
          }),
        );
      getSqlite().transaction(() => {
        writeItemStreams(getSqlite(), "thread-stream", "a1", { assistant_text: "OK_CLEAN" });
      })();

      await runMemoryCapturePass(Date.parse("2026-11-16T00:05:00.000Z"));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("Assistant: OK_CLEAN");

      const prepared = prepareLaunchMemory(undefined, "project-1");
      const p1 = prepared?.instructions;
      const p2 = launchMemoryInstructions(undefined, "project-2");
      expect(p1).toContain("Staging server listens on port 4180");
      expect(p1).toContain("Start PR feedback with the root cause");
      expect(p2).toContain("Start PR feedback with the root cause");
      expect(p2).not.toContain("Staging server listens on port 4180");

      recordMemoryUsage(prepared?.entryIds ?? []);
      const entries = (await handleMemoryCommand({ action: "list" })) as Array<{
        usageCount: number;
      }>;
      expect(entries.some((entry) => entry.usageCount > 0)).toBe(true);
    } finally {
      setMemoryModelCaller(undefined);
    }
  });

  it("lets manual dream consolidate existing entries, retire bloated ones, and undo cleanly", async () => {
    const { setMemoryModelCaller } = await import("./runtime");
    const { dbUpsertMemoryEntry } = await import("@/host/db/memoryStore");
    dbUpsertMemoryEntry({
      id: "bloated-1",
      scope: "project",
      projectId: "project-1",
      category: "project",
      summary: "Long bloated prompt with test and port info",
      body: "Long bloated prompt with test and port info",
      confidence: 0.75,
      polarity: "fact",
      quote: null,
      lockedByUser: false,
      pinned: false,
      archived: false,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
      source: "learned",
    });
    dbUpsertMemoryEntry({
      id: "dup-2",
      scope: "project",
      projectId: "project-1",
      category: "project",
      summary: "Staging port is 4180",
      body: "Staging port is 4180",
      confidence: 0.75,
      polarity: "fact",
      quote: null,
      lockedByUser: false,
      pinned: false,
      archived: false,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
      source: "learned",
    });
    setMemoryModelCaller({
      complete: async () =>
        JSON.stringify({
          observations: [
            {
              scope: "project",
              projectId: "project-1",
              category: "project",
              statement: "Staging runs on port 4180",
              quote: null,
              polarity: "fact",
              explicit: true,
            },
          ],
          retireIds: ["bloated-1", "dup-2"],
        }),
    });
    try {
      const result = (await handleMemoryCommand({ action: "dream" })) as {
        runId: string;
        report: string;
      };
      expect(result.report).toContain("Retired 2");
      const status = (await handleMemoryCommand({ action: "status" })) as {
        lastDreamRunId?: string | null;
      };
      expect(status.lastDreamRunId).toBe(result.runId);
      const afterDream = (await handleMemoryCommand({ action: "list" })) as Array<{
        summary: string;
      }>;
      expect(afterDream.map((entry) => entry.summary)).toEqual(["Staging runs on port 4180"]);

      await handleMemoryCommand({ action: "undo", runId: result.runId });
      const afterUndo = (await handleMemoryCommand({ action: "list" })) as Array<{ id: string }>;
      expect(afterUndo.map((entry) => entry.id).sort()).toEqual(["bloated-1", "dup-2"]);
    } finally {
      setMemoryModelCaller(undefined);
    }
  });
});
