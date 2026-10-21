import { fork, type ChildProcess, type ForkOptions } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createRuntimePayloadProjectionSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
} from "@/build/runtimePayloadProjectionSource.mjs";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbReplaceThreadRuntimeSnapshot } from "@/host/db/runtimeItems";
import { dbGetThreadRuntimeItemCommitted } from "@/host/db/runtimeItemRead";
import {
  dbAppendThreadTerminalOutput,
  dbGetThreadTerminalScrollbackRecord,
} from "@/host/db/terminalScrollback";
import { testThread } from "@/host/db/runtimeItems.testFixtures";
import { sessionExportWorkerMessageSchema } from "./sessionExportProtocol";
import { HostSessionExports } from "./hostSessionExport";
import {
  sessionExportStartSchema,
  sessionExportReadSchema,
} from "@/shared/contracts/sessionExport";

let artifacts: string, entry: string, directory: string, dbPath: string;
const children: Array<{
  child: ChildProcess;
  closed: Promise<[number | null, NodeJS.Signals | null]>;
}> = [];
beforeAll(async () => {
  artifacts = mkdtempSync(resolve("tmp/session-export-worker-"));
  entry = join(artifacts, "sessionExportWorker.cjs");
  const source = createRuntimePayloadProjectionSource(process.cwd()).source;
  await build({
    entryPoints: [fileURLToPath(new URL("./sessionExportWorker.ts", import.meta.url))],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: { "@": resolve("src") },
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
});
beforeEach(() => {
  directory = mkdtempSync(resolve("tmp/session-export-data-"));
  dbPath = join(directory, "state.sqlite");
  initDatabase(dbPath);
  dbUpsertProject(
    {
      id: "project-1",
      name: "Export fixture",
      location: { kind: "posix", path: directory },
      createdAt: "2026-01-01T00:00:00Z",
    },
    0,
  );
  dbUpsertThread(
    {
      ...testThread(),
      sessionRef: { providerSessionId: "private-session", discoveredAt: "2026-10-21T00:00:00Z" },
      config: { model: "private-profile-model" },
    },
    0,
  );
});
afterEach(async () => {
  for (const { child, closed } of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  }
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});
afterAll(() => rmSync(artifacts, { recursive: true, force: true }));

function childFixture() {
  const options: ForkOptions & { windowsHide: boolean } = {
    execArgv: [],
    env: { ...process.env, NODE_PATH: resolve("node_modules") },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  };
  const child = fork(entry, [], options);
  // Parent-initiated disconnect can omit ChildProcess.close on Windows; join each actual handle.
  const exited = new Promise<[number | null, NodeJS.Signals | null]>((resolveExit) =>
    child.once("exit", (code, signal) => resolveExit([code, signal])),
  );
  const closed = Promise.all([
    exited,
    once(child.stdout!, "close"),
    once(child.stderr!, "close"),
  ]).then(([exit]) => exit);
  children.push({ child, closed });
  const chunks: Buffer[] = [],
    errors: Buffer[] = [],
    messages: unknown[] = [];
  child.stdout!.on("data", (data: Buffer) => chunks.push(data));
  child.stderr!.on("data", (data: Buffer) => errors.push(data));
  child.on("message", (frame) => messages.push(frame));
  const exportId = randomUUID();
  const input = {
    kind: "initialize",
    version: 1,
    exportId,
    dbPath,
    threadId: "thread-1",
    runtimeNotice: null,
  };
  const ready = async () => {
    const message = once(child, "message");
    child.send(input);
    const [frame] = await Promise.race([
      message,
      closed.then(([code]) => {
        throw new Error(`Export worker exited ${code}: ${Buffer.concat(errors).toString()}`);
      }),
    ]);
    expect(sessionExportWorkerMessageSchema.parse(frame)).toEqual({
      kind: "ready",
      version: 1,
      exportId,
    });
  };
  return { child, closed, chunks, messages, errors, exportId, input, ready };
}

describe("real read-only session export worker", () => {
  it("pins one snapshot across a concurrent rebase and streams complete canonical items, turns and saved Unicode terminal tail", async () => {
    const payload = { name: "fixture-tool", text: "Ω🦉猫".repeat(180_000), raw: { kept: true } };
    const turns = [
      {
        startedAt: "2026-10-21T00:00:00Z",
        endedAt: "2026-10-21T00:01:00Z",
        anchorItemId: "item-🧪",
      },
    ];
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      [
        {
          id: "item-🧪",
          type: "tool_call",
          state: "completed",
          payload,
          streams: { command_output: "retained\n🧪".repeat(5000) },
        },
      ],
      turns,
      null,
    );
    const canonical = dbGetThreadRuntimeItemCommitted("thread-1", "item-🧪");
    const terminal = "x".repeat(8191) + "🧪" + "y".repeat(8191) + "\ud800";
    dbAppendThreadTerminalOutput("thread-1", terminal, terminal.length);
    const scrollback = dbGetThreadTerminalScrollbackRecord("thread-1");
    getSqlite()
      .prepare("INSERT INTO app_state(key, value) VALUES (?, ?)")
      .run("private-fixture-secret", "never-export-profile");
    const f = childFixture();
    await f.ready();
    expect(f.chunks).toEqual([]);
    await dbReplaceThreadRuntimeSnapshot("thread-1", [], [], null);
    dbUpsertThread({ ...testThread(), title: "Changed after snapshot" }, 0);
    f.child.send({ kind: "continue", version: 1, exportId: f.exportId });
    expect(await f.closed).toEqual([0, null]);
    const bytes = Buffer.concat(f.chunks),
      json = JSON.parse(bytes.toString());
    expect(bytes.length).toBeGreaterThan(1_048_576);
    expect(json).toMatchObject({
      kind: "poracode-session",
      formatVersion: 1,
      scope: "persisted-thread",
      session: { id: "thread-1", title: "Runtime persistence" },
      runtimeItems: [canonical],
      completedTurns: turns,
      contextUsage: null,
      terminalScrollback: scrollback,
    });
    expect(json.runtimeItems).toHaveLength(1);
    for (const privateValue of ["private-session", "private-profile-model", "never-export-profile"])
      expect(bytes.toString()).not.toContain(privateValue);
    expect(f.messages.at(-1)).toEqual({
      kind: "complete",
      version: 1,
      exportId: f.exportId,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(f.child.stdout!.readableEnded).toBe(true);
    expect(getSqlite().prepare("SELECT title FROM threads WHERE id = ?").get("thread-1")).toEqual({
      title: "Changed after snapshot",
    });
  });

  it.each([0, 2])("refuses worker version %s before database admission", async (version) => {
    const f = childFixture();
    f.child.send({ ...f.input, version, dbPath: join(directory, "does-not-exist.sqlite") });
    expect((await f.closed)[0]).not.toBe(0);
    expect(f.chunks).toEqual([]);
    expect(f.messages).toEqual([]);
  });

  it("retires the held read process and pipes when its owner disconnects", async () => {
    const f = childFixture();
    await f.ready();
    f.child.disconnect();
    await f.closed;
    expect(f.child.stdout!.destroyed).toBe(true);
    expect(f.child.stderr!.destroyed).toBe(true);
    expect(f.messages).toHaveLength(1);
  });

  it("refuses a continue frame for another export without emitting transcript bytes", async () => {
    const f = childFixture();
    await f.ready();
    f.child.send({ kind: "continue", version: 1, exportId: randomUUID() });
    expect((await f.closed)[0]).not.toBe(0);
    expect(f.chunks).toEqual([]);
  });

  it("composes the real persistence fence, registry, native worker and checksummed chunk reader without a provider", async () => {
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      [
        {
          id: "message",
          type: "agent_message",
          state: "completed",
          payload: { text: "Hello 🧪" },
          streams: {},
        },
      ],
      [],
      { usedTokens: 17, maxTokens: 1000 },
    );
    const host = new HostSessionExports({ path: entry, dbPath });
    const signal = new AbortController().signal;
    const context = { signal, assertActive: () => signal.throwIfAborted() };
    try {
      const started = sessionExportStartSchema.parse(
        await host.execute({ action: "sessions-export-start", threadId: "thread-1" }, context),
      );
      const chunks: Buffer[] = [];
      let offset = 0;
      for (;;) {
        const result = sessionExportReadSchema.parse(
          await host.execute(
            {
              action: "sessions-export-read",
              threadId: "thread-1",
              exportId: started.exportId,
              offset,
            },
            context,
          ),
        );
        if (result.finished) break;
        chunks.push(Buffer.from(result.data, "base64"));
        offset = result.nextOffset;
      }
      expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({
        runtimeItems: [{ id: "message", payload: { text: "Hello 🧪" } }],
        contextUsage: { usedTokens: 17, maxTokens: 1000 },
      });
    } finally {
      await host.dispose();
    }
  });
});
