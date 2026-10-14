import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const controls = vi.hoisted(() => ({
  completeLegacy: null as (() => void) | null,
  completeTurns: null as ((value: string) => void) | null,
}));
vi.mock("@/host/db/asyncReads", () => ({
  readDatabaseAsync(operation: string, _args: unknown, direct: () => unknown) {
    if (operation === "completedTurnPage")
      return new Promise<string>((resolve) => {
        controls.completeTurns = resolve;
      });
    if (operation === "legacyShellCatalog")
      return new Promise((resolve, reject) => {
        controls.completeLegacy = () => {
          try {
            resolve(direct());
          } catch (error) {
            reject(error);
          }
        };
      });
    return Promise.resolve().then(direct);
  },
  releaseAsyncDatabaseReads() {},
  closeAsyncDatabaseReads: async () => {},
  enableAsyncDatabaseReads() {},
}));
vi.mock("@/shared/remote/legacyReadContract", async (original) => ({
  ...(await original<typeof import("@/shared/remote/legacyReadContract")>()),
  LEGACY_READ_RESERVATION_MAX_BYTES: 4096,
}));
import { initDatabase, closeDatabase, getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { testThread } from "@/host/db/runtimeItems.testFixtures";
import { SessionConfigInventory } from "@/host/remote/server/sessionConfigInventory";
import { ThreadLiveReadState } from "@/host/remote/server/threadLiveReadState";
import { LegacyBulkReadAdmission } from "@/host/remote/server/legacyBulkReadAdmission";
import { handleLegacyAdmittedShellSnapshot } from "@/host/remote/server/legacyAdmittedReads";
import { handleBoundedThreadTurns } from "@/host/remote/server/historyReadHandlers";
import { legacySnapshotReservationBytes } from "@/host/remote/server/legacyReadPrecheck";
class Response extends EventEmitter {
  statusCode = 0;
  body = "";
  headersSent = false;
  writableFinished = false;
  destroyed = false;
  setHeader() {}
  appendHeader() {}
  end(body?: string) {
    this.body = body ?? "";
    this.headersSent = true;
    this.writableFinished = true;
    this.emit("finish");
  }
}
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(resolvePath("tmp/async-history-races-"));
  initDatabase(join(directory, "state.sqlite"));
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project",
      location: { kind: "posix", path: directory },
      createdAt: "2026-01-01T00:00:00Z",
    },
    0,
  );
  dbUpsertThread({ ...testThread(), id: "thread-1" }, 0);
  controls.completeLegacy = null;
  controls.completeTurns = null;
});
afterEach(() => {
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});
it("refuses catalog growth before a delayed worker materializes its snapshot", async () => {
  const initialCharge = legacySnapshotReservationBytes({});
  expect(initialCharge).toBeLessThan(4096);

  const res = new Response();
  const ctx = {
    seq: 7,
    options: { gitSummaries: () => ({}) },
    legacyBulkReadAdmission: new LegacyBulkReadAdmission(),
    sessionConfigInventory: new SessionConfigInventory(),
    threadLiveReadState: new ThreadLiveReadState(),
  };
  const pending = handleLegacyAdmittedShellSnapshot({
    ctx,
    req: { headers: {} },
    res,
    url: new URL("http://host/api/snapshot"),
    params: {},
    session: { sessionId: "alice" },
    readClass: "legacy-bulk",
  } as never);
  expect(controls.completeLegacy).not.toBeNull();
  getSqlite()
    .prepare("UPDATE threads SET terminal_prompt = ? WHERE id = ?")
    .run("x".repeat(8192), "thread-1");
  controls.completeLegacy!();
  await pending;
  expect(legacySnapshotReservationBytes({})).toBeGreaterThan(4096);
  expect(res.statusCode).toBe(503);
  expect(res.body).toContain("legacy_read_too_large");
  expect(res.body).not.toContain('"threads"');
});
it("refuses an incapable turns reader when a notice appears during its worker await", async () => {
  let notice: unknown = null;
  const readNotice = vi.fn<() => unknown>(() => notice);
  const res = new Response();
  const ctx = { options: { runtimeHistoryGap: { readNotice } } };
  const pending = handleBoundedThreadTurns({
    ctx,
    req: { headers: {} },
    res,
    url: new URL("http://host/api/threads/thread-1/turns?reads=bounded-v1"),
    params: { threadId: "thread-1" },
  } as never);
  expect(readNotice).toHaveBeenCalledOnce();
  expect(controls.completeTurns).not.toBeNull();
  notice = {
    threadId: "thread-1",
    source: "exact",
    reason: "global-bytes",
    refusedEvents: 1,
    refusedBytes: 100,
    acknowledgedCount: 1,
    firstAcknowledgedAt: 1,
    lastAcknowledgedAt: 1,
  };
  controls.completeTurns!('{"reads":"bounded-v1","turns":[],"completedTurnsNextCursor":null}\n');
  await expect(pending).rejects.toMatchObject({
    code: "runtime_history_notice_unsupported",
    status: 409,
  });
  expect(readNotice).toHaveBeenCalledTimes(2);
  expect(res.headersSent).toBe(false);
});
