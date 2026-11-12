import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimePayloadProjectionSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
} from "@/build/runtimePayloadProjectionSource.mjs";
import {
  closeAsyncDatabaseWrites,
  enableAsyncDatabaseWrites,
  getAsyncDatabaseWrites,
} from "./asyncWrites";
import { closeDatabase, getProfileDataGeneration, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { addRuntimeItemCommitListener } from "./runtimeItemCommitListeners";
import { dbReadThreadRuntimeItems } from "./runtimeItems";
import { testThread } from "./runtimeItems.testFixtures";
import { readRuntimePayloadOrigin } from "./runtimePayloadOrigins";
import {
  applyAdmittedRuntimePayloadBatch,
  applyRuntimeEvents,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  beginRuntimeFence,
  commitRuntimeThreadPrefixAsync,
  flushRuntimeFence,
  releaseRuntimeFence,
  resetRuntimePersistenceForTests,
} from "./runtimePersistenceRuntime";
import {
  admitRuntimePayloadOriginEnvelope,
  captureRuntimePayloadOrigin,
  serializeRuntimePayloadOrigins,
} from "@/shared/runtimePayloadOriginProtocol";

let artifactsDir: string;
let writeWorkerPath: string;
let tempDbDir: string;
let dbPath: string;

beforeAll(async () => {
  mkdirSync(resolvePath("tmp"), { recursive: true });
  artifactsDir = mkdtempSync(resolvePath("tmp/async-database-write-worker-"));
  writeWorkerPath = join(artifactsDir, "databaseWriteWorker.cjs");
  const projectionSource = createRuntimePayloadProjectionSource(process.cwd()).source;
  await build({
    entryPoints: [fileURLToPath(new URL("./databaseWriteWorker.ts", import.meta.url))],
    outfile: writeWorkerPath,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: { "@": resolvePath("src") },
    plugins: [
      {
        name: "runtime-payload-projections",
        setup(builder) {
          builder.onResolve(
            { filter: new RegExp(`^${RUNTIME_PAYLOAD_PROJECTION_MODULE}$`) },
            () => ({
              path: RUNTIME_PAYLOAD_PROJECTION_MODULE,
              namespace: "runtime-payload-projections",
            }),
          );
          builder.onLoad({ filter: /.*/, namespace: "runtime-payload-projections" }, () => ({
            contents: projectionSource,
            loader: "ts",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
});

beforeEach(() => {
  tempDbDir = mkdtempSync(resolvePath("tmp/async-write-db-"));
  dbPath = join(tempDbDir, "state.sqlite");
  initDatabase(dbPath);
  attachRuntimePersistenceDurableGapFromCurrentConnection();
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project",
      location: { kind: "posix", path: "/repo" },
      createdAt: "2026-11-11T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread(testThread(), 0);
  dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
});

afterEach(async () => {
  await closeAsyncDatabaseWrites();
  closeDatabase();
  resetRuntimePersistenceForTests();
  rmSync(tempDbDir, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(artifactsDir, { recursive: true, force: true });
});

describe("AsyncDatabaseWrites worker offload", () => {
  it("commits multi-thread runtime batches, usage ledger updates, and fence flushes on the dedicated worker thread", async () => {
    enableAsyncDatabaseWrites(dbPath, writeWorkerPath);
    await vi.waitFor(() => expect(getAsyncDatabaseWrites()).not.toBeNull());

    const committedPayloads: Array<{ threadId: string; itemIds: ReadonlySet<string> | "all" }> = [];
    const unsubCommit = addRuntimeItemCommitListener((threadId, itemIds) => {
      committedPayloads.push({ threadId, itemIds });
    });

    try {
      const profileGenBefore = getProfileDataGeneration();

      expect(
        applyRuntimeEvents("thread-1", [
          {
            type: "item.started",
            threadId: "thread-1",
            itemId: "msg-1",
            itemType: "assistant_message",
          },
          {
            type: "content.delta",
            threadId: "thread-1",
            itemId: "msg-1",
            stream: "assistant_text",
            delta: "Hello from worker writer",
          },
          {
            type: "usage.spent",
            threadId: "thread-1",
            usage: {
              counterKind: "per-call",
              counter: 1,
              scopeId: "thread-1",
              epoch: 0,
              sampleId: "sample-w1",
              tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
            },
          },
        ]).kind,
      ).toBe("accepted");

      expect(
        applyRuntimeEvents("thread-2", [
          {
            type: "item.started",
            threadId: "thread-2",
            itemId: "msg-2",
            itemType: "assistant_message",
          },
          {
            type: "item.completed",
            threadId: "thread-2",
            itemId: "msg-2",
            payload: { role: "assistant", content: [{ kind: "text", text: "Done" }] },
          },
        ]).kind,
      ).toBe("accepted");

      // Flush thread-1 through the async fence path (which now executes on the worker thread).
      const fence = beginRuntimeFence("thread-1");
      const fenceResult = await flushRuntimeFence(fence);
      releaseRuntimeFence(fence);
      expect(fenceResult.kind).toBe("committed");

      // Wait for scheduled async flush to drain thread-2 and emit its commit notification.
      await vi.waitFor(() => {
        expect(dbReadThreadRuntimeItems("thread-1")).toHaveLength(1);
        expect(dbReadThreadRuntimeItems("thread-2")).toHaveLength(1);
        expect(committedPayloads.some((entry) => entry.threadId === "thread-1")).toBe(true);
        expect(committedPayloads.some((entry) => entry.threadId === "thread-2")).toBe(true);
      });

      expect(dbReadThreadRuntimeItems("thread-1")[0]?.streams.assistant_text).toBe(
        "Hello from worker writer",
      );
      expect(getProfileDataGeneration()).toBeGreaterThan(profileGenBefore);
    } finally {
      unsubCommit();
    }
  });

  it("preserves admitted payload-origin Symbol custody across worker postMessage", async () => {
    enableAsyncDatabaseWrites(dbPath, writeWorkerPath);
    await vi.waitFor(() => expect(getAsyncDatabaseWrites()).not.toBeNull());

    const captured = captureRuntimePayloadOrigin(
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "tool-1",
        itemType: "command_execution",
        payload: { command: "echo hi" },
      },
      "codex",
    );
    const serialized = serializeRuntimePayloadOrigins(
      {
        type: "thread-runtime-events",
        threadId: "thread-1",
        events: [captured],
      },
      "gen-test-1",
    );
    const admission = admitRuntimePayloadOriginEnvelope(serialized, "gen-test-1");
    expect(admission).toBeDefined();

    expect(applyAdmittedRuntimePayloadBatch(admission!, 0).kind).toBe("accepted");
    await commitRuntimeThreadPrefixAsync("thread-1");

    const storedOrigin = readRuntimePayloadOrigin(getSqlite(), "thread-1", "tool-1");
    expect(storedOrigin).toEqual({
      formatOwnerKey: "codex",
      originFormatVersion: 1,
    });
  });

  it("never double-commits content.delta when async flush, fence flush, and close overlap", async () => {
    enableAsyncDatabaseWrites(dbPath, writeWorkerPath);
    await vi.waitFor(() => expect(getAsyncDatabaseWrites()).not.toBeNull());

    expect(
      applyRuntimeEvents("thread-1", [
        {
          type: "item.started",
          threadId: "thread-1",
          itemId: "msg-race",
          itemType: "assistant_message",
        },
        {
          type: "content.delta",
          threadId: "thread-1",
          itemId: "msg-race",
          stream: "assistant_text",
          delta: "EXACT_ONCE",
        },
      ]).kind,
    ).toBe("accepted");

    // Overlap scheduled worker flush, an explicit async prefix commit (turn-end path),
    // a read fence flush, and worker close/shutdown drain!
    const [, fenceOutcome] = await Promise.all([
      commitRuntimeThreadPrefixAsync("thread-1"),
      (async () => {
        const fence = beginRuntimeFence("thread-1");
        try {
          return await flushRuntimeFence(fence);
        } finally {
          releaseRuntimeFence(fence);
        }
      })(),
    ]);
    expect(fenceOutcome.kind).toBe("committed");

    await closeAsyncDatabaseWrites();
    closeDatabase();

    initDatabase(dbPath);
    const items = dbReadThreadRuntimeItems("thread-1");
    expect(items).toHaveLength(1);
    expect(items[0]?.streams.assistant_text).toBe("EXACT_ONCE");
  });

  it("holds per-thread in-flight reservations across rolled-back batch fallbacks so fences never double-write", async () => {
    const { RuntimeWriteQueue } = await import("./runtimeWriteQueue");
    const singleWrites: Array<{ threadId: string; delta: string }> = [];
    const queue = new RuntimeWriteQueue(() => {});

    queue.enqueue("t1", [
      { type: "content.delta", threadId: "t1", itemId: "i1", stream: "assistant_text", delta: "A" },
    ]);
    queue.enqueue("t2", [
      { type: "content.delta", threadId: "t2", itemId: "i2", stream: "assistant_text", delta: "B" },
    ]);

    const t1Gate = Promise.withResolvers<void>();
    let fencePromise: Promise<unknown> | null = null;

    const batchPromise = queue.flushBudgetedAsync(
      { maxThreads: 4, maxBytes: 1024 * 1024, maxMs: 50 },
      {
        atomicBatchWriterAsync: async () => ({
          kind: "rolled-back",
          error: new Error("simulated batch rollback"),
        }),
        writeAsync: async (threadId, events) => {
          if (threadId === "t1") {
            // While `t1`'s fallback write is suspended, start a fence chunk flush on `t2`!
            // `t2` MUST still be reserved by the rolled-back batch until `t2`'s own fallback runs.
            fencePromise = queue.flushThreadThroughAsync(
              "t2",
              Number.MAX_SAFE_INTEGER,
              async (id, evs) => {
                singleWrites.push({
                  threadId: id,
                  delta: (evs[0] as { delta: string }).delta,
                });
              },
            );
            await t1Gate.promise;
          }
          singleWrites.push({
            threadId,
            delta: (events[0] as { delta: string }).delta,
          });
        },
      },
    );

    // Give the rolled-back batch a microtask turn to enter `t1`'s fallback write.
    await vi.waitFor(() => expect(fencePromise).not.toBeNull());
    t1Gate.resolve();

    await Promise.all([batchPromise, fencePromise ?? Promise.resolve()]);

    expect(singleWrites).toEqual([
      { threadId: "t1", delta: "A" },
      { threadId: "t2", delta: "B" },
    ]);
  });
});
