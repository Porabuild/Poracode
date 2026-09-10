import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

type SupervisorCall = { type: string; payload: Record<string, unknown> };

const supervisorHarness = vi.hoisted(() => {
  const state = {
    calls: [] as SupervisorCall[],
    /** Scripted behavior per procedure name; defaults to resolved success. */
    handlers: new Map<string, (payload: Record<string, unknown>) => Promise<unknown>>(),
  };
  return state;
});

vi.mock("@/main/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = vi.fn<() => void>();
    dispose = vi.fn<() => void>();
    async call(type: string, payload: Record<string, unknown>): Promise<unknown> {
      supervisorHarness.calls.push({ type, payload });
      const handler = supervisorHarness.handlers.get(type);
      if (!handler) return undefined;
      return handler(payload);
    }
  },
}));

import { closeDatabase, dbClaimCheckpointRevertOperation, initDatabase } from "@/main/db";
import {
  BackendHostCore,
  RevertCheckpointRefusedError,
  type RevertCheckpointResult,
} from "./BackendHostCore";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/main/db/runtimeItems.testFixtures";
import {
  dbAppendThreadCompletedTurn,
  dbApplyThreadRuntimeEvents,
  dbGetThreadRuntimeItems,
} from "@/main/db/runtimeItems";
import { dbUpsertProject, dbUpsertThread, dbGetThread } from "@/main/db/projectsThreads";
import type { ProviderRevertAnchor, Thread } from "@/shared/contracts";
import type { ProjectLocation } from "@/shared/contracts/common";

const location: ProjectLocation = { kind: "posix", path: "/tmp/revert-project" };

const revertInput = (operationKey: string) => ({
  threadId: "thread-1",
  checkpointItemId: "checkpoint",
  operationKey,
  projectLocation: location,
});

const CLAUDE_ANCHOR: ProviderRevertAnchor = {
  version: 1,
  data: { resumeSessionAt: "assistant-uuid-1", remainingTurns: 1 },
};

const makeHost = (onEvent: (event: SupervisorEvent) => void): BackendHostCore =>
  new BackendHostCore({
    baseDir: dir,
    dbPath: join(dir, "state.sqlite"),
    supervisor: {
      appVersion: "test",
      isDev: false,
      supervisorPath: "/supervisor.cjs",
      wslHelpersDir: "/wsl",
      secretStorageKey: "secret",
    },
    onEvent,
    onReset: vi.fn<() => void>(),
  });

const anchorCalls = () => supervisorHarness.calls.filter((c) => c.type === "createRevertAnchor");
const restoreCalls = () =>
  supervisorHarness.calls.filter((c) => c.type === "restoreToRevertAnchor");
const providerCalls = () =>
  supervisorHarness.calls.filter((c) => c.type === "rollbackThreadConversation");
const truncateEvents = () =>
  events.filter((e) => e.type === "thread-runtime-event" && e.event.type === "runtime.truncated");

/** Default anchor-capable provider: createRevertAnchor journals a stable
 * absolute target and restoreToRevertAnchor succeeds. */
const installAnchorProvider = (): void => {
  supervisorHarness.handlers.set("createRevertAnchor", async () => ({ anchor: CLAUDE_ANCHOR }));
};

let dir = "";
let events: SupervisorEvent[] = [];
let host: BackendHostCore | null = null;

const reopenDatabase = (): void => {
  closeDatabase();
  initDatabase(join(dir, "state.sqlite"));
};

describe.skipIf(!sqliteAvailable)("BackendHostCore.revertCheckpoint", () => {
  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-revert-core-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Revert project",
        location,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    events = [];
    supervisorHarness.calls.length = 0;
    supervisorHarness.handlers.clear();
    installAnchorProvider();
    host = makeHost((event) => events.push(event));
  });

  afterEach(() => {
    host?.dispose();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const seedThread = (overrides: Partial<Thread> = {}): Thread => {
    const thread: Thread = { ...testThread(), ...overrides };
    dbUpsertThread(thread, 0);
    return thread;
  };

  /** Seeds "root" before the checkpoint, then the checkpoint, then `turns`
   * completed turns after it. */
  const seedTranscript = (turns: number): void => {
    dbApplyThreadRuntimeEvents(
      "thread-1",
      ["root", "checkpoint", ...Array.from({ length: turns * 2 }, (_, i) => `item-${i}`)].map(
        (itemId) => ({
          type: "item.started" as const,
          threadId: "thread-1",
          itemId,
          itemType: "assistant_message" as const,
        }),
      ),
    );
    for (let index = 0; index < turns; index += 1) {
      dbAppendThreadCompletedTurn("thread-1", {
        startedAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
        endedAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.500Z`,
        anchorItemId: `item-${index * 2 + 1}`,
      });
    }
  };

  it("restores to a journaled absolute anchor: provider, files, and truncate complete as one operation", async () => {
    seedThread({ status: "idle" });
    seedTranscript(2);

    const result = await host!.revertCheckpoint(revertInput("op-1"));
    expect(result.outcome).toBe("completed");
    expect(result.replayed).toBe(false);
    expect(result.numTurns).toBe(2);
    expect(result.providerPhase).toBe("completed");
    expect(result.filesPhase).toBe("completed");
    expect(result.truncatePhase).toBe("completed");
    expect(anchorCalls()).toHaveLength(1);
    expect(anchorCalls()[0]!.payload).toMatchObject({ threadId: "thread-1", numTurns: 2 });
    expect(restoreCalls()).toHaveLength(1);
    expect(restoreCalls()[0]!.payload).toMatchObject({
      threadId: "thread-1",
      anchor: CLAUDE_ANCHOR,
    });
    expect(providerCalls()).toHaveLength(0);
    expect(truncateEvents()).toHaveLength(1);
  });

  it("refuses a revert while the thread is working without touching the journal", async () => {
    seedThread({ status: "working" });
    await expect(host!.revertCheckpoint(revertInput("op-busy"))).rejects.toMatchObject({
      reason: "THREAD_TURN_ACTIVE",
    });
    expect(supervisorHarness.calls).toHaveLength(0);
    expect(events).toHaveLength(0);
    const refused = host!.revertCheckpoint(revertInput("op-busy"));
    await expect(refused).rejects.toBeInstanceOf(RevertCheckpointRefusedError);
    void dbClaimCheckpointRevertOperation; // type-surface parity with the journal module
  });

  it("journals the anchor before the restore side effect, and a resumed attempt re-restores the SAME anchor without re-creating it", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    let restoreFail = true;
    let filesFail = true;
    supervisorHarness.handlers.set("restoreToRevertAnchor", async () => {
      if (restoreFail) {
        // Recycle the DB handle like a crash after the anchor was journalled.
        closeDatabase();
        initDatabase(join(dir, "state.sqlite"));
        restoreFail = false;
        throw new Error("interrupted after anchor restore started");
      }
      return undefined;
    });
    supervisorHarness.handlers.set("restoreFileCheckpoint", async () => {
      if (filesFail) {
        filesFail = false;
        throw new Error("git restore failed");
      }
      return undefined;
    });
    // Restore failed (anchor already journalled) AND files failed, so the
    // compound settles `failed` and the journal row stays resumable.
    const first = await host!.revertCheckpoint(revertInput("op-anchor-crash"));
    expect(first.outcome).toBe("failed");
    expect(first.providerPhase).toBe("failed");
    expect(first.filesPhase).toBe("failed");
    expect(anchorCalls()).toHaveLength(1);
    expect(truncateEvents()).toHaveLength(0);

    reopenDatabase();
    const restarted = makeHost((event) => events.push(event));
    try {
      const resumed = await restarted.revertCheckpoint(revertInput("op-anchor-crash"));
      expect(resumed.replayed).toBe(false);
      expect(resumed.outcome).toBe("completed");
      // The anchor was created exactly once across both attempts; the resume
      // re-restored from the journalled copy instead of re-planning.
      expect(anchorCalls()).toHaveLength(1);
      expect(restoreCalls()).toHaveLength(2);
      expect(JSON.stringify(restoreCalls()[1]!.payload.anchor)).toBe(JSON.stringify(CLAUDE_ANCHOR));
      expect(truncateEvents()).toHaveLength(1);
    } finally {
      restarted.dispose();
    }
  });

  it("falls back to the legacy relative rollback when the provider declares no anchor support", async () => {
    seedThread({ status: "idle" });
    seedTranscript(2);
    supervisorHarness.handlers.set("createRevertAnchor", async () => {
      throw new Error("Kimi Code does not support revert anchors.");
    });
    const result = await host!.revertCheckpoint(revertInput("op-acp"));
    expect(result.outcome).toBe("completed");
    expect(result.providerPhase).toBe("completed");
    expect(result.numTurns).toBe(2);
    expect(anchorCalls()).toHaveLength(1);
    expect(restoreCalls()).toHaveLength(0);
    expect(providerCalls()).toHaveLength(1);
    expect(providerCalls()[0]!.payload).toMatchObject({ threadId: "thread-1", numTurns: 2 });
    expect(truncateEvents()).toHaveLength(1);
  });

  it("keeps legacy provider failure non-destructive: local_only continues files and truncate", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    supervisorHarness.handlers.set("createRevertAnchor", async () => {
      throw new Error("Kimi Code does not support revert anchors.");
    });
    supervisorHarness.handlers.set("rollbackThreadConversation", async () => {
      throw new Error("rollback capability missing for this provider");
    });
    const result = await host!.revertCheckpoint(revertInput("op-local-only"));
    expect(result.outcome).toBe("completed_local_only");
    expect(result.providerPhase).toBe("failed");
    expect(result.filesPhase).toBe("completed");
    expect(result.truncatePhase).toBe("completed");
    expect(truncateEvents()).toHaveLength(1);
  });

  it("never re-executes an ambiguous provider restore on retry", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    supervisorHarness.handlers.set("restoreToRevertAnchor", async () => {
      throw new Error('Supervisor request "restoreToRevertAnchor" timed out.');
    });
    const first = await host!.revertCheckpoint(revertInput("op-ambiguous"));
    expect(first.outcome).toBe("ambiguous");
    expect(first.providerPhase).toBe("ambiguous");
    expect(restoreCalls()).toHaveLength(1);

    const retry = await host!.revertCheckpoint(revertInput("op-ambiguous"));
    expect(retry.replayed).toBe(true);
    expect(retry.outcome).toBe("ambiguous");
    expect(restoreCalls()).toHaveLength(1);
  });

  it("aborts before truncate when the file restore fails, and resumes on retry without re-running the provider", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    let filesFail = true;
    supervisorHarness.handlers.set("restoreFileCheckpoint", async () => {
      if (filesFail) throw new Error("git restore failed");
      return undefined;
    });
    const first = await host!.revertCheckpoint(revertInput("op-files"));
    expect(first.outcome).toBe("failed");
    expect(first.filesPhase).toBe("failed");
    expect(first.truncatePhase).toBe("pending");
    expect(truncateEvents()).toHaveLength(0);

    filesFail = false;
    const retry = await host!.revertCheckpoint(revertInput("op-files"));
    expect(retry.outcome).toBe("completed");
    expect(retry.replayed).toBe(false);
    expect(retry.truncatePhase).toBe("completed");
    expect(restoreCalls()).toHaveLength(1);
    expect(truncateEvents()).toHaveLength(1);
  });

  it("resumes an interrupted operation on a restarted host: a completed provider phase is never repeated", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    let filesFail = true;
    supervisorHarness.handlers.set("restoreFileCheckpoint", async () => {
      if (filesFail) {
        // Recycle the database handle like a crash would, leaving the journal
        // row (with its frozen plan and provider receipt) on disk.
        closeDatabase();
        initDatabase(join(dir, "state.sqlite"));
        throw new Error("interrupted after provider phase");
      }
      return undefined;
    });
    const first = await host!.revertCheckpoint(revertInput("op-crash"));
    expect(first.outcome).toBe("failed");
    expect(first.providerPhase).toBe("completed");
    filesFail = false;
    reopenDatabase();

    // A restarted host picks the operation back up from the journal.
    const restarted = makeHost((event) => events.push(event));
    try {
      const resumed = await restarted.revertCheckpoint(revertInput("op-crash"));
      expect(resumed.replayed).toBe(false);
      expect(resumed.outcome).toBe("completed");
      expect(resumed.truncatePhase).toBe("completed");
      expect(restoreCalls()).toHaveLength(1);
      expect(truncateEvents()).toHaveLength(1);
    } finally {
      restarted.dispose();
    }
  });

  it("replays a settled operation without any new side effects", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    const first = await host!.revertCheckpoint(revertInput("op-settled"));
    expect(first.outcome).toBe("completed");
    const callsAfterFirst = supervisorHarness.calls.length;
    const eventsAfterFirst = events.length;

    const replay = await host!.revertCheckpoint(revertInput("op-settled"));
    expect(replay.replayed).toBe(true);
    expect(replay.outcome).toBe("completed");
    expect(supervisorHarness.calls.length).toBe(callsAfterFirst);
    expect(events.length).toBe(eventsAfterFirst);
  });

  it("replays a settled revert after a host restart and keeps turns appended since", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    const first = await host!.revertCheckpoint(revertInput("op-restart-replay"));
    expect(first.outcome).toBe("completed");
    const callsAfterFirst = supervisorHarness.calls.length;

    // After the settled revert, new turns arrive from the provider (the user
    // continued on another client). A journaled replay must not delete them.
    dbApplyThreadRuntimeEvents(
      "thread-1",
      ["late-1", "late-2"].map((itemId) => ({
        type: "item.started" as const,
        threadId: "thread-1",
        itemId,
        itemType: "assistant_message" as const,
      })),
    );
    dbAppendThreadCompletedTurn("thread-1", {
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:00.500Z",
      anchorItemId: "late-2",
    });

    reopenDatabase();
    const restarted = makeHost((event) => events.push(event));
    try {
      const replay = await restarted.revertCheckpoint(revertInput("op-restart-replay"));
      // The restarted host serves the stored receipt: settled outcome, no
      // provider round-trip, and no second truncation event.
      expect(replay.replayed).toBe(true);
      expect(replay.outcome).toBe("completed");
      expect(supervisorHarness.calls).toHaveLength(callsAfterFirst);
      expect(truncateEvents()).toHaveLength(1);
      const itemIds = dbGetThreadRuntimeItems("thread-1").map((item) => item.id);
      expect(itemIds).toContain("late-1");
      expect(itemIds).toContain("late-2");
    } finally {
      restarted.dispose();
    }
  });

  it("rejects reusing an operation key for a different checkpoint", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    await host!.revertCheckpoint(revertInput("op-key"));
    await expect(
      host!.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "root",
        operationKey: "op-key",
        projectLocation: location,
      }),
    ).rejects.toThrow(/already used/);
  });

  it("serializes two concurrent reverts of the same thread: the second converges without a second provider restore", async () => {
    seedThread({ status: "idle" });
    seedTranscript(1);
    let releaseFirst: (() => void) | undefined;
    supervisorHarness.handlers.set("restoreToRevertAnchor", async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    });
    const first = host!.revertCheckpoint(revertInput("op-first"));
    const second = host!.revertCheckpoint(revertInput("op-second"));
    await new Promise((r) => setTimeout(r, 50));
    expect(restoreCalls()).toHaveLength(1);
    releaseFirst?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.outcome).toBe("completed");
    // The checkpoint item survives the first truncate, so the second operation
    // legitimately converges: the recount finds zero turns after it, and the
    // phases skip or no-op. The destructive restore ran exactly once.
    expect(secondResult.numTurns).toBe(0);
    expect(secondResult.truncatePhase).toBe("noop");
    expect(secondResult.replayed).toBe(false);
    expect(restoreCalls()).toHaveLength(1);
    expect(truncateEvents()).toHaveLength(1);
  });

  it("reports a noop when the checkpoint item no longer exists, without side effects", async () => {
    seedThread({ status: "idle" });
    const result: RevertCheckpointResult = await host!.revertCheckpoint(revertInput("op-noop"));
    expect(result.outcome).toBe("noop");
    expect(supervisorHarness.calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("refuses a launching thread and leaves its status untouched", async () => {
    seedThread({ status: "launching" });
    await expect(host!.revertCheckpoint(revertInput("op-launching"))).rejects.toBeInstanceOf(
      RevertCheckpointRefusedError,
    );
    expect(dbGetThread("thread-1")?.status).toBe("launching");
    expect(supervisorHarness.calls).toHaveLength(0);
  });
});
