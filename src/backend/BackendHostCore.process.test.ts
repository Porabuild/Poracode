import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { NativeThreadActivityChange } from "@/shared/backendHostProtocol";
import { BackendHostCore } from "./BackendHostCore";
import { createNativeThreadActivityProjection } from "./nativeThreadActivity";
import {
  closeDatabase,
  dbGetThreadRuntimeItems,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
  RuntimePersistenceUnknownThreadError,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";

it.skipIf(!sqliteAvailable || process.platform === "win32")(
  "persists final IPC from a real retiring supervisor before closing SQLite",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-host-process-join-"));
    const dbPath = join(root, "state.sqlite");
    const supervisorPath = join(root, "supervisor.cjs");
    const finalEvent = {
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: {
        type: "item.started",
        threadId: "thread-1",
        itemId: "shutdown-final",
        itemType: "assistant_message",
      },
    };
    await writeFile(
      supervisorPath,
      `process.on("message",request=>process.send({replyTo:request.id,ok:true,data:process.pid}));process.on("SIGTERM",()=>process.send(${JSON.stringify(finalEvent)},()=>setTimeout(()=>process.exit(0),80)));setInterval(()=>{},1000);`,
    );
    let host: BackendHostCore | undefined;
    try {
      const onEvent = vi.fn<() => void>();
      host = new BackendHostCore({
        baseDir: root,
        dbPath,
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath,
          wslHelpersDir: join(root, "wsl"),
          secretStorageKey: "fixture",
        },
        onEvent,
        onReset: vi.fn<() => void>(),
      });
      dbUpsertProject(
        {
          id: "project-1",
          name: "Fixture",
          location: { kind: "posix", path: root },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread(testThread(), 0);
      const pid = await host.supervisorClient.call("fixture-ready" as never, undefined as never);
      expect(pid).toBeTypeOf("number");
      await host.dispose();
      expect(onEvent).toHaveBeenCalledExactlyOnceWith(finalEvent);
      expect(() => process.kill(pid as number, 0)).toThrow(/ESRCH/);

      initDatabase(dbPath);
      try {
        expect((await dbGetThreadRuntimeItems("thread-1")).map((item) => item.id)).toContain(
          "shutdown-final",
        );
      } finally {
        closeDatabase();
      }
    } finally {
      await host?.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.skipIf(!sqliteAvailable || process.platform === "win32")(
  "projects a hot terminal and canonical runtime burst as bounded native activity (A2)",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-host-process-activity-"));
    const dbPath = join(root, "state.sqlite");
    const supervisorPath = join(root, "supervisor.cjs");
    const burstSize = 40;
    const bulkMarker = "x".repeat(64);
    await writeFile(
      supervisorPath,
      `const reply = (request, data) => process.send({ replyTo: request.id, ok: true, data });
process.on("message", (request) => {
  if (request && request.type === "fixture-burst") {
    for (let i = 0; i < ${burstSize}; i += 1) {
      process.send({ type: "thread-output", threadId: "thread-1", data: "${bulkMarker}", outputLength: 64, terminalInstanceId: "gen-burst" });
    }
    for (let i = 0; i < ${burstSize}; i += 1) {
      process.send({ type: "thread-runtime-events", threadId: "thread-1", events: [{ type: "item.completed", threadId: "thread-1", itemId: "item-" + i }] });
    }
    process.send({ type: "thread-state", threadId: "thread-1", status: "working", attention: "working", canResumeWithConfig: false });
    process.send({ type: "thread-state", threadId: "thread-1", status: "idle", attention: "none", canResumeWithConfig: false });
    process.send({ type: "thread-state", threadId: "thread-2", status: "launching", attention: "none", canResumeWithConfig: false });
    reply(request, null);
    return;
  }
  reply(request, process.pid);
});
setInterval(() => {}, 1000);
`,
    );
    let host: BackendHostCore | undefined;
    const activity: NativeThreadActivityChange[][] = [];
    const projection = createNativeThreadActivityProjection({
      emit: (changes) => activity.push(changes),
    });
    const observed: string[] = [];
    const onReset = vi.fn<() => void>();
    try {
      host = new BackendHostCore({
        baseDir: root,
        dbPath,
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath,
          wslHelpersDir: join(root, "wsl"),
          secretStorageKey: "fixture",
        },
        onEvent: (event) => {
          observed.push(event.type);
          projection.observe(event);
        },
        onReset,
      });
      dbUpsertProject(
        {
          id: "project-1",
          name: "Fixture",
          location: { kind: "posix", path: root },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread(testThread(), 0);

      await host.supervisorClient.call("fixture-burst" as never, undefined as never);
      await vi.waitFor(() => expect(activity).toHaveLength(1), { timeout: 5_000 });

      // The core observed the whole bulk stream (persistence ran for every
      // event), but only the two coalesced transitions crossed the projection.
      expect(observed.filter((type) => type === "thread-output")).toHaveLength(burstSize);
      expect(observed.filter((type) => type === "thread-runtime-events")).toHaveLength(burstSize);
      expect(activity[0]).toEqual([
        { threadId: "thread-1", active: false },
        { threadId: "thread-2", active: true },
      ]);
      // Bounded native projection: two booleans, never transcript/terminal bytes.
      const serialized = JSON.stringify(activity);
      expect(serialized).not.toContain(bulkMarker);
      expect(serialized.length).toBeLessThan(256);

      // A supervisor restart notifies main (which clears its working set) and
      // the fresh child keeps projecting transitions.
      await host.restartSupervisor();
      expect(onReset).toHaveBeenCalledOnce();
      await host.supervisorClient.call("fixture-burst" as never, undefined as never);
      await vi.waitFor(() => expect(activity).toHaveLength(2), { timeout: 5_000 });
      expect(activity[1]).toEqual([
        { threadId: "thread-1", active: false },
        { threadId: "thread-2", active: true },
      ]);
    } finally {
      projection.dispose();
      await host?.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.skipIf(!sqliteAvailable || process.platform === "win32")(
  "refuses an unknown-thread launch before the supervisor receives it (B1 pre-launch touch)",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-host-prelaunch-touch-"));
    const dbPath = join(root, "state.sqlite");
    const supervisorPath = join(root, "supervisor.cjs");
    const markerPath = join(root, "start-thread.received");
    // The fixture records every startThread it receives; the unknown-thread
    // refusal must happen before the request reaches it at all.
    await writeFile(
      supervisorPath,
      `const { writeFileSync } = require("node:fs");
process.on("message", (request) => {
  if (request && request.type === "startThread") {
    writeFileSync(${JSON.stringify(markerPath)}, String(request.payload.threadId));
  }
  process.send({ replyTo: request.id, ok: true, data: process.pid });
});
setInterval(() => {}, 1000);
`,
    );
    let host: BackendHostCore | undefined;
    try {
      host = new BackendHostCore({
        baseDir: root,
        dbPath,
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath,
          wslHelpersDir: join(root, "wsl"),
          secretStorageKey: "fixture",
        },
        onEvent: vi.fn<() => void>(),
        onReset: vi.fn<() => void>(),
      });
      await host.startSupervisor();
      const launchPayload = {
        threadId: "thread-missing",
        projectLocation: { kind: "posix", path: root },
        agentKind: "claude",
        config: {},
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
      };
      await expect(
        host.supervisorClient.call("startThread", launchPayload as never),
      ).rejects.toBeInstanceOf(RuntimePersistenceUnknownThreadError);
      expect(existsSync(markerPath)).toBe(false);

      // A real thread is touched before dispatch and reaches the supervisor.
      dbUpsertProject(
        {
          id: "project-1",
          name: "Fixture",
          location: { kind: "posix", path: root },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        0,
      );
      dbUpsertThread({ ...testThread(), id: "thread-known" }, 0);
      await host.supervisorClient.call("startThread", {
        ...launchPayload,
        threadId: "thread-known",
      } as never);
      expect(existsSync(markerPath)).toBe(true);
      expect(
        getSqlite()
          .prepare("SELECT epoch FROM thread_runtime_epoch_touches WHERE thread_id = ?")
          .get("thread-known"),
      ).toEqual({ epoch: 1 });
    } finally {
      await host?.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
