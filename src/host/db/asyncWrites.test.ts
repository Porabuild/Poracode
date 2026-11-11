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
import { closeDatabase, getProfileDataGeneration, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { addRuntimeItemCommitListener } from "./runtimeItemCommitListeners";
import { dbReadThreadRuntimeItems } from "./runtimeItems";
import { testThread } from "./runtimeItems.testFixtures";
import {
  applyRuntimeEvents,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  beginRuntimeFence,
  flushRuntimeFence,
  releaseRuntimeFence,
  resetRuntimePersistenceForTests,
} from "./runtimePersistenceRuntime";

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

      // Wait for scheduled async flush to drain thread-2 as well.
      await vi.waitFor(() => {
        expect(dbReadThreadRuntimeItems("thread-1")).toHaveLength(1);
        expect(dbReadThreadRuntimeItems("thread-2")).toHaveLength(1);
      });

      expect(dbReadThreadRuntimeItems("thread-1")[0]?.streams.assistant_text).toBe(
        "Hello from worker writer",
      );
      expect(getProfileDataGeneration()).toBeGreaterThan(profileGenBefore);
      expect(committedPayloads.some((entry) => entry.threadId === "thread-1")).toBe(true);
      expect(committedPayloads.some((entry) => entry.threadId === "thread-2")).toBe(true);
    } finally {
      unsubCommit();
    }
  });
});
