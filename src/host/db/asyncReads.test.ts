import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { fork } from "node:child_process";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimePayloadProjectionSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
} from "@/build/runtimePayloadProjectionSource.mjs";
import {
  AsyncDatabaseReads,
  closeAsyncDatabaseReads,
  enableAsyncDatabaseReads,
  readDatabaseAsync,
} from "./asyncReads";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbGetThreadRuntimeItems,
  dbReadThreadRuntimeItems,
  dbReplaceThreadRuntimeItems,
} from "./runtimeItems";
import { started, delta } from "./runtimePersistence.atomic.testFixtures";
import { applyRuntimeEvents, runThreadRuntimeMutation } from "./runtimePersistenceRuntime";
import { testThread } from "./runtimeItems.testFixtures";
import { createSchema53PayloadOriginDatabase } from "./runtimePayloadOrigins.testFixtures";
import { CatalogCursorError } from "@/shared/remote/catalogReadContract";
import { LEGACY_READ_BUSY_CODE } from "@/shared/remote/legacyReadContract";
import { parseCatalogReadNegotiation } from "../remote/server/catalogPages";
import {
  DATABASE_READ_WORKER_PROTOCOL_VERSION,
  DatabaseReadUnavailableError,
} from "./databaseReadProtocol";
import { HistoryItemTooLargeError } from "../remote/server/historyReadBudget";
import { resolveCatalogEffectiveCaps } from "../remote/server/catalogPageBudget";
import { RuntimePersistenceController } from "./runtimePersistenceController";
import {
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
} from "./runtimePersistenceTypes";
import { applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "../remote/RemoteAccessServer";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
  readRemoteImageRef,
} from "@/shared/remote";
import { stampCatalogShellPageBody } from "../remote/server/catalogShellBody";
import { resetStableUpdatedAt } from "../remote/server/stableUpdatedAt";
import {
  readImagePreviewSnapshot,
  resetImagePreviews,
  setImagePreviewStoreDir,
} from "../remote/server/imagePreview";

let artifacts: string;
let workerPath: string;
let delayedWorkerPath: string;
let directory: string;
let dbPath: string;
const pools: AsyncDatabaseReads[] = [];

beforeAll(async () => {
  mkdirSync(resolvePath("tmp"), { recursive: true });
  artifacts = mkdtempSync(resolvePath("tmp/async-database-workers-"));
  const source = createRuntimePayloadProjectionSource(process.cwd()).source;
  for (const name of ["databaseReadWorker", "databaseReadWorker.testFixtures"]) {
    await build({
      entryPoints: [fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
      outfile: join(artifacts, `${name}.cjs`),
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      alias: { "@": resolvePath("src") },
      plugins: [
        {
          name: "runtime-payload-projections",
          setup(builder) {
            builder.onResolve({ filter: /^poracode:runtime-payload-projections$/ }, () => ({
              path: RUNTIME_PAYLOAD_PROJECTION_MODULE,
              namespace: "runtime-projection",
            }));
            builder.onLoad({ filter: /.*/, namespace: "runtime-projection" }, () => ({
              contents: source,
              loader: "ts",
              resolveDir: process.cwd(),
            }));
          },
        },
      ],
    });
  }
  workerPath = join(artifacts, "databaseReadWorker.cjs");
  delayedWorkerPath = join(artifacts, "databaseReadWorker.testFixtures.cjs");
});

afterAll(() => rmSync(artifacts, { recursive: true, force: true }));
beforeEach(() => {
  directory = mkdtempSync(resolvePath("tmp/async-database-"));
  dbPath = join(directory, "state.sqlite");
  // Upgrade the previous persisted format through the normal owning writer.
  createSchema53PayloadOriginDatabase(dbPath).close();
  initDatabase(dbPath);
  dbUpsertProject(
    {
      id: "project-1",
      name: "Reads",
      location: { kind: "posix", path: directory },
      createdAt: "2026-01-01T00:00:00Z",
    },
    0,
  );
  for (const id of ["thread-1", "fast", "slow", "never"])
    dbUpsertThread({ ...testThread(), id }, 0);
});

afterEach(async () => {
  await closeAsyncDatabaseReads();
  await Promise.all(pools.splice(0).map((reader) => reader.close()));
  resetImagePreviews();
  await setImagePreviewStoreDir(null);
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function pool(path = workerPath, imagePreviews = false) {
  const reads = new AsyncDatabaseReads(dbPath, path, imagePreviews);
  pools.push(reads);
  return reads;
}

describe("worker-backed SQLite reads", () => {
  it("generates and persists previews from bounded history and restores them into replacement workers", async () => {
    const previewDir = join(directory, "image-previews-v1");
    await setImagePreviewStoreDir(previewDir);
    const png = await sharp(randomBytes(256 * 256 * 3), {
      raw: { width: 256, height: 256, channels: 3 },
    })
      .png()
      .toBuffer();
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "image-1",
        type: "tool_call",
        state: "completed",
        streams: {},
        payload: {
          name: "Read",
          status: "success",
          images: [`data:image/png;base64,${png.toString("base64")}`],
        },
      },
    ]);
    const input = { threadId: "thread-1", limit: 50 };
    const caps = resolveCatalogEffectiveCaps({});
    const reads = pool(workerPath, true);
    const first = await reads.read("boundedSnapshot", [
      "thread-1",
      {
        compactDetails: false,
        includeTerminalScrollback: false,
        completedTurnsLimit: 10,
        targetTimelineEntryCount: 50,
        caps,
      },
    ]);
    const payload = first.projectedDesc[0]!.payload as { images: unknown[] };
    expect(readRemoteImageRef(payload.images[0])?.preview).toBeUndefined();
    await vi.waitFor(() => expect(readImagePreviewSnapshot("thread-1")).toHaveLength(1));
    await vi.waitFor(() =>
      expect(readdirSync(previewDir).filter((name) => name.endsWith(".json"))).toHaveLength(1),
    );
    await reads.close();
    resetImagePreviews();
    await setImagePreviewStoreDir(previewDir);
    const replacement = pool(workerPath, true);
    const next = JSON.parse(
      await replacement.read("boundedItems", [input, caps, undefined, false]),
    );
    expect(readRemoteImageRef(next.items[0].payload.images[0])?.preview).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    const headless = pool();
    const without = JSON.parse(
      await headless.read("boundedItems", [input, caps, undefined, false]),
    );
    expect(readRemoteImageRef(without.items[0].payload.images[0])?.preview).toBeUndefined();
  });
  it("keeps shell response bytes stable after a read process is replaced", async () => {
    resetStableUpdatedAt();
    const negotiation = parseCatalogReadNegotiation(
      new URL("http://host/api/snapshot?reads=bounded-v1&threadLimit=1"),
      "shell-snapshot",
    );
    const projection = { seq: 7, gitSummaries: {} };
    const firstReader = pool();
    const first = stampCatalogShellPageBody(
      await firstReader.read("catalogShell", [projection, negotiation]),
    );
    await firstReader.close();
    const replacement = pool();
    const next = stampCatalogShellPageBody(
      await replacement.read("catalogShell", [projection, negotiation]),
    );
    expect(next).toBe(first);
  });

  it("preserves legacy admission while foreground HTTP history and Stop remain available", async () => {
    enableAsyncDatabaseReads(dbPath, delayedWorkerPath);
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({}) as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "test",
      identity: { desktopId: "async-reads", label: "Async reads" },
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 0,
      truncateThreadRuntime: () => {},
      callSupervisor,
    });
    try {
      const info = await server.start();
      const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
      const pairing = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantType: "pairing-token",
          credential,
          scopes: ["session:read", "session:operate"],
          client: { label: "Async read test", deviceType: "mobile" },
        }),
      });
      expect(pairing.ok).toBe(true);
      const { accessToken } = (await pairing.json()) as { accessToken: string };
      const headers = {
        authorization: `Bearer ${accessToken}`,
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      };
      const shellUrl = new URL("/api/snapshot?reads=bounded-v1&threadLimit=1", info.httpBaseUrl);
      const initialShell = await fetch(shellUrl, { headers });
      expect(initialShell.status).toBe(200);
      const shellEtag = initialShell.headers.get("etag");
      expect(shellEtag).not.toBeNull();
      await initialShell.arrayBuffer();
      writeFileSync(`${dbPath}.hold-slow-query`, "hold until foreground requests finish");
      let slowFinished = false;
      const slow = fetch(new URL("/api/threads/slow/history", info.httpBaseUrl), {
        headers,
      })
        .then(async (response) => {
          await response.arrayBuffer();
          return response.status;
        })
        .finally(() => {
          slowFinished = true;
        });
      void slow.catch(() => undefined);
      await vi.waitFor(() => expect(existsSync(`${dbPath}.slow-query-active`)).toBe(true));
      const refusedLegacy = await fetch(new URL("/api/threads/fast/history", info.httpBaseUrl), {
        headers,
      });
      expect(refusedLegacy.status).toBe(503);
      expect(refusedLegacy.headers.get("retry-after")).toBe("1");
      expect(await refusedLegacy.json()).toMatchObject({ error: { code: LEGACY_READ_BUSY_CODE } });
      const fast = await fetch(
        new URL("/api/threads/fast/history?reads=bounded-v1", info.httpBaseUrl),
        { headers },
      );
      expect(fast.status).toBe(200);
      expect(((await fast.json()) as { thread: { id: string } }).thread.id).toBe("fast");
      const unchangedShell = await fetch(shellUrl, {
        headers: { ...headers, "if-none-match": shellEtag! },
      });
      expect(unchangedShell.status).toBe(304);
      await unchangedShell.arrayBuffer();
      const stop = await fetch(new URL("/api/threads/fast/interrupt", info.httpBaseUrl), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ reason: "user" }),
      });
      expect(stop.ok).toBe(true);
      expect(callSupervisor).toHaveBeenCalledWith(
        "interruptThread",
        expect.objectContaining({ threadId: "fast" }),
      );
      expect(slowFinished).toBe(false);
      rmSync(`${dbPath}.hold-slow-query`);
      expect(await slow).toBe(200);
    } finally {
      rmSync(`${dbPath}.hold-slow-query`, { force: true });
      await server.dispose();
    }
  });

  it("retires a native query when its host IPC disconnects", async () => {
    const child = fork(delayedWorkerPath, [], {
      execArgv: [],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    let diagnostic = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-8192);
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      child.once("exit", (code, signal) => resolve({ code, signal })),
    );
    try {
      const ready = new Promise<void>((resolve, reject) => {
        child.once("message", () => resolve());
        child.once("error", reject);
        child.once("exit", () => reject(new Error(`Reader exited before ready: ${diagnostic}`)));
      });
      child.send({ kind: "initialize", version: DATABASE_READ_WORKER_PROTOCOL_VERSION, dbPath });
      await ready;
      child.send({
        version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
        id: 1,
        operation: "runtimeItems",
        args: ["never"],
      });
      await vi.waitFor(() => expect(existsSync(`${dbPath}.query-active`)).toBe(true));
      child.disconnect();
      expect(await exited).toEqual(
        process.platform === "win32"
          ? { code: 1, signal: null }
          : { code: null, signal: "SIGKILL" },
      );
    } finally {
      child.kill("SIGKILL");
      await exited;
      child.stderr?.destroy();
    }
  });

  it("refuses a held read contaminated during its await without blocking another thread", async () => {
    const controller = new RuntimePersistenceController({
      write: applyThreadRuntimeEventsNow,
      bounds: { maxPendingEventsPerThread: 1 },
      capacityRelief: false,
      flushIntervalMs: 60_000,
    });
    try {
      const token = controller.beginFence("slow");
      expect((await controller.flushFence(token)).kind).toBe("committed");
      const deferred = Promise.withResolvers<string>();
      const reading = controller.readFencedAsync(token, () => deferred.promise);
      controller.admit("slow", [started("slow", "later")]);
      controller.admit("slow", [started("slow", "overflow")]);
      deferred.resolve("old prefix");
      await expect(reading).rejects.toBeInstanceOf(RuntimePersistenceContaminatedError);
      expect(token.released).toBe(true);
      const other = controller.beginFence("fast");
      expect((await controller.flushFence(other)).kind).toBe("committed");
      expect(await controller.readFencedAsync(other, () => "other thread")).toBe("other thread");
    } finally {
      controller.stopTimers();
    }
  });

  it("refuses a worker result after its runtime fence expires", async () => {
    const controller = new RuntimePersistenceController({
      write: applyThreadRuntimeEventsNow,
      fenceMaxHoldMs: 20,
    });
    try {
      const token = controller.beginFence("slow");
      expect((await controller.flushFence(token)).kind).toBe("committed");
      const deferred = Promise.withResolvers<string>();
      const reading = controller.readFencedAsync(token, () => deferred.promise);
      await new Promise((resolve) => setTimeout(resolve, 40));
      deferred.resolve("stale result");
      await expect(reading).rejects.toBeInstanceOf(RuntimePersistenceDegradedError);
      expect(token.released).toBe(true);
      expect(controller.accessWaiterCount()).toBe(0);
    } finally {
      controller.stopTimers();
    }
  });
  it("reads upgraded existing history and leaves command receipts unchanged", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "old",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Retained history" },
      },
    ]);
    getSqlite()
      .prepare(
        "INSERT INTO remote_command_receipts (command_id, route, state, response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("receipt", "thread-command", "in_progress", null, Date.now(), Date.now());
    const storedVersion = getSqlite()
      .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get();
    expect(await pool().read("runtimeItems", ["thread-1"])).toEqual(
      dbReadThreadRuntimeItems("thread-1"),
    );
    expect(
      getSqlite()
        .prepare("SELECT state FROM remote_command_receipts WHERE command_id = ?")
        .get("receipt"),
    ).toEqual({ state: "in_progress" });
    expect(
      getSqlite().prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual(storedVersion);
  });

  it("serves another thread and host continuations while one SQLite read is blocked", async () => {
    const reads = pool(delayedWorkerPath);
    let slowFinished = false;
    const slow = reads.read("runtimeItems", ["slow"]).finally(() => {
      slowFinished = true;
    });
    void slow.catch(() => undefined);
    let hostContinued = false;
    setImmediate(() => {
      hostContinued = true;
    });
    expect(await reads.read("runtimeItems", ["fast"])).toEqual([]);
    expect(hostContinued).toBe(true);
    expect(slowFinished).toBe(false);
    await slow;
  });

  it("keeps later runtime writes and same-thread mutations outside a worker's pinned prefix", async () => {
    enableAsyncDatabaseReads(dbPath, delayedWorkerPath);
    await Promise.all(
      Array.from({ length: 2 }, () =>
        readDatabaseAsync("runtimeItems", ["fast"], () => dbReadThreadRuntimeItems("fast")),
      ),
    );
    applyRuntimeEvents("slow", [started("slow", "first"), delta("slow", "prefix", "first")]);
    writeFileSync(`${dbPath}.hold-slow-query`, "hold until the parallel read finishes");
    const reading = dbGetThreadRuntimeItems("slow");
    void reading.catch(() => undefined);
    // The public read pins synchronously, before its first await.
    applyRuntimeEvents("slow", [delta("slow", ":later", "first")]);
    let mutated = false;
    const mutation = runThreadRuntimeMutation("slow", "truncate", () => {
      mutated = true;
    });
    try {
      await vi.waitFor(() => expect(existsSync(`${dbPath}.slow-query-active`)).toBe(true));
      expect(await dbGetThreadRuntimeItems("fast")).toEqual([]);
      expect(mutated).toBe(false);
    } finally {
      rmSync(`${dbPath}.hold-slow-query`, { force: true });
    }
    const items = await reading;
    expect(items[0]?.streams.assistant_text).toBe("prefix");
    await mutation;
    expect(mutated).toBe(true);
    expect((await dbGetThreadRuntimeItems("slow"))[0]?.streams.assistant_text).toBe("prefix:later");
  });

  it("bounds read admission and joins active and queued reads on close", async () => {
    const reads = pool(delayedWorkerPath);
    const admitted = Promise.allSettled(
      Array.from({ length: 64 }, () => reads.read("runtimeItems", ["never"])),
    );
    await expect(reads.read("runtimeItems", ["thread-1"])).rejects.toBeInstanceOf(
      DatabaseReadUnavailableError,
    );
    await reads.close();
    expect((await admitted).every((result) => result.status === "rejected")).toBe(true);
    expect(reads.hasPendingReads).toBe(false);
    await expect(reads.read("runtimeItems", ["thread-1"])).rejects.toBeInstanceOf(
      DatabaseReadUnavailableError,
    );
  });

  it("terminates a timed-out query and keeps the reader usable for other threads", async () => {
    const reads = pool(delayedWorkerPath);
    await expect(reads.read("runtimeItems", ["never"])).rejects.toBeInstanceOf(
      DatabaseReadUnavailableError,
    );
    expect(await reads.read("runtimeItems", ["fast"])).toEqual([]);
  });

  it("refuses an old worker protocol without a synchronous fallback", async () => {
    const stalePath = join(directory, "old-worker.cjs");
    writeFileSync(stalePath, "process.send({kind:'ready',version:2});");
    await expect(pool(stalePath).read("runtimeItems", ["thread-1"])).rejects.toThrow(
      "protocol is incompatible",
    );
  });

  it("refuses version 2 initialization before opening the database reader", async () => {
    const child = fork(workerPath, [], {
      execArgv: [],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    const messages: unknown[] = [];
    child.on("message", (message: unknown) => messages.push(message));
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      child.send({ kind: "initialize", version: 2, dbPath });
      await exited;
      expect(messages).toEqual([]);
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
  });

  it("refuses malformed worker frames without throwing from the host message handler", async () => {
    const invalidPath = join(directory, "invalid-worker.cjs");
    writeFileSync(invalidPath, "process.send(null);");
    await expect(pool(invalidPath).read("runtimeItems", ["fast"])).rejects.toBeInstanceOf(
      DatabaseReadUnavailableError,
    );
  });

  it("preserves typed cursor and byte-budget refusals across the worker boundary", async () => {
    const reads = pool();
    const negotiation = parseCatalogReadNegotiation(
      new URL("http://host/api/threads?reads=bounded-v1"),
      "thread-list",
    );
    await expect(
      reads.read("catalogThreadPage", [{ seq: 0, gitSummaries: {} }, negotiation, "invalid"]),
    ).rejects.toBeInstanceOf(CatalogCursorError);
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "large",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "x".repeat(4096) },
      },
    ]);
    await expect(
      reads.read("boundedItems", [
        { threadId: "thread-1", limit: 50 },
        resolveCatalogEffectiveCaps({ maxBytes: 100 }),
        undefined,
        false,
      ]),
    ).rejects.toBeInstanceOf(HistoryItemTooLargeError);
  });

  it("rejects future schema versions without migrating or changing the owner's data", async () => {
    getSqlite().prepare("UPDATE app_state SET value = '999' WHERE key = 'schema_version'").run();
    await expect(pool().read("runtimeItems", ["thread-1"])).rejects.toBeInstanceOf(
      DatabaseReadUnavailableError,
    );
    expect(
      getSqlite().prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "999" });
  });

  it("uses the direct reader only for explicit offline database compositions", async () => {
    expect(
      await readDatabaseAsync("runtimeItems", ["fast"], () => dbReadThreadRuntimeItems("fast")),
    ).toEqual([]);
  });
});
