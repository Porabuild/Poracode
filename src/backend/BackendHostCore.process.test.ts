import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { BackendHostCore } from "./BackendHostCore";
import {
  closeDatabase,
  dbGetThreadRuntimeItems,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
} from "@/main/db";
import { sqliteAvailable, testThread } from "@/main/db/runtimeItems.testFixtures";

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
        expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toContain(
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
