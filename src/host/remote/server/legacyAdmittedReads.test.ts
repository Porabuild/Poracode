import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  LEGACY_READ_BUSY_CODE,
  LEGACY_READ_TOO_LARGE_CODE,
} from "@/shared/remote/legacyReadContract";
import type { RemoteServerContext } from "./context";
import { LegacyBulkReadAdmission } from "./legacyBulkReadAdmission";
import {
  handleLegacyAdmittedShellSnapshot,
  handleLegacyAdmittedThreadHistory,
} from "./legacyAdmittedReads";

/**
 * Wrapper-level proof of the legacy bulk-read lease lifecycle: admission is
 * explicit (2 global / 1 principal), the lease is held until the response
 * completes, and it is released on every path — success, typed refusal,
 * thrown error and client abort. The delegated handler is the real catalog
 * handler; only the response object is controllable so completion timing is
 * deterministic.
 */

class FakeResponse extends EventEmitter {
  statusCode = 200;
  readonly headers: Record<string, string | number | string[]> = {};
  body = "";
  headersSent = false;
  writableFinished = false;
  destroyed = false;

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers[name.toLowerCase()] = Array.isArray(value)
      ? [...value]
      : (value as string | number);
    return this;
  }

  appendHeader(name: string, value: string | readonly string[]): this {
    const key = name.toLowerCase();
    const next = Array.isArray(value) ? [...value] : [value as string];
    const previous = this.headers[key];
    this.headers[key] = previous === undefined ? next : [previous, ...next].flat();
    return this;
  }

  end(body?: string): this {
    this.headersSent = true;
    if (body !== undefined) this.body += body;
    return this;
  }

  /**
   * Real `ServerResponse` ordering: `finish` marks the response complete and is
   * followed by `close` once the socket is torn down — before the wrapper's
   * pending `finally` removes its close listener.
   */
  finish(): void {
    this.writableFinished = true;
    this.emit("finish");
    this.emit("close");
  }

  abort(): void {
    this.destroyed = true;
    this.emit("close");
  }
}

function fakeRequest(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}

function threadFixture(index: number) {
  return {
    id: `thread-${String(index).padStart(4, "0")}`,
    projectId: "project-1",
    title: `Thread ${index}`,
    agentKind: "claude" as const,
    config: { model: "sonnet" },
    status: "idle" as const,
    attention: "none" as const,
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function context(admission: LegacyBulkReadAdmission): RemoteServerContext {
  return {
    options: { gitSummaries: () => ({}) },
    seq: 7,
    legacyBulkReadAdmission: admission,
  } as unknown as RemoteServerContext;
}

function historyContext(admission: LegacyBulkReadAdmission): RemoteServerContext {
  return {
    options: {
      gitSummaries: () => ({}),
      callSupervisor: async (name: string) => {
        if (name === "readThreadBackgroundTasks") return [];
        if (name === "readTerminalScrollback") return "";
        return null;
      },
    },
    seq: 7,
    legacyBulkReadAdmission: admission,
    backgroundTasksByThread: new Map(),
  } as unknown as RemoteServerContext;
}

function callFor(
  ctx: RemoteServerContext,
  res: FakeResponse,
  readClass: "normal" | "legacy-bulk" = "legacy-bulk",
  path = "/api/snapshot",
  params: Record<string, string> = {},
) {
  return {
    ctx,
    req: fakeRequest(),
    res: res as unknown as ServerResponse,
    url: new URL(`http://host${path}`),
    forwardOrigin: null,
    bearerToken: null,
    session: { sessionId: "alice" },
    readClass,
    params,
  } as never;
}

describe.skipIf(!sqliteAvailable)("legacy admitted reads", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-legacy-admitted-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Project 1",
        location: { kind: "posix", path: "/tmp/project-1" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    for (let index = 0; index < 3; index += 1) dbUpsertThread(threadFixture(index), index);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("serves the complete legacy response and releases after completion", async () => {
    const admission = new LegacyBulkReadAdmission();
    const res = new FakeResponse();
    const pending = handleLegacyAdmittedShellSnapshot(callFor(context(admission), res));
    // The response is written but not finished: the lease is still held.
    await Promise.resolve();
    expect(admission.usage().active).toBe(1);
    expect(res.body).toContain('"threads"');
    expect(res.body).not.toContain('"reads"');
    res.finish();
    await pending;
    // The `close` Node emits after `finish` is not a client abort.
    expect(admission.usage()).toMatchObject({ active: 0, admitted: 1, refused: 0, aborted: 0 });
  });

  it("counts a real interrupted response as an abort, not the close after finish", async () => {
    const admission = new LegacyBulkReadAdmission();
    const completedRes = new FakeResponse();
    const completedPending = handleLegacyAdmittedShellSnapshot(
      callFor(context(admission), completedRes),
    );
    await Promise.resolve();
    completedRes.finish();
    await completedPending;
    expect(admission.usage()).toMatchObject({ admitted: 1, aborted: 0 });

    const abortedRes = new FakeResponse();
    const pending = handleLegacyAdmittedShellSnapshot(callFor(context(admission), abortedRes));
    await Promise.resolve();
    expect(admission.usage().active).toBe(1);
    abortedRes.abort();
    await pending;
    expect(admission.usage()).toMatchObject({ active: 0, admitted: 2, aborted: 1 });
  });

  it("refuses the third concurrent legacy read typed and releases on abort", async () => {
    const admission = new LegacyBulkReadAdmission();
    // Two held leases (one per principal) saturate the global cap.
    const held = [admission.tryAdmit("alice"), admission.tryAdmit("bob")];
    // The dispatcher maps this typed refusal to 503 + Retry-After; here the
    // wrapper must reject before any response is written.
    const refusedRes = new FakeResponse();
    await expect(
      handleLegacyAdmittedShellSnapshot(callFor(context(admission), refusedRes)),
    ).rejects.toMatchObject({ code: LEGACY_READ_BUSY_CODE, status: 503, retryAfterMs: 1_000 });
    expect(refusedRes.body).toBe("");

    for (const lease of held) lease.release();
    const res = new FakeResponse();
    const pending = handleLegacyAdmittedShellSnapshot(callFor(context(admission), res));
    await Promise.resolve();
    res.abort();
    await pending;
    expect(admission.usage()).toMatchObject({ active: 0, aborted: 1 });
  });

  it("wraps the legacy history read with the same admission and release", async () => {
    const admission = new LegacyBulkReadAdmission();
    const held = [admission.tryAdmit("alice"), admission.tryAdmit("bob")];
    const refused = callFor(
      historyContext(admission),
      new FakeResponse(),
      "legacy-bulk",
      "/api/threads/thread-0000/history",
      { threadId: "thread-0000" },
    );
    await expect(handleLegacyAdmittedThreadHistory(refused)).rejects.toMatchObject({
      code: LEGACY_READ_BUSY_CODE,
    });
    for (const lease of held) lease.release();

    const res = new FakeResponse();
    const call = callFor(
      historyContext(admission),
      res,
      "legacy-bulk",
      "/api/threads/thread-0000/history",
      { threadId: "thread-0000" },
    );
    const pending = handleLegacyAdmittedThreadHistory(call);
    await Promise.resolve();
    res.finish();
    await pending;
    expect(res.body).toContain('"runtimeItems"');
    expect(res.body).not.toContain('"reads"');
    expect(admission.usage()).toMatchObject({ active: 0, aborted: 0 });
  });

  it("releases the lease when the delegated handler throws", async () => {
    const admission = new LegacyBulkReadAdmission();
    const ctx = {
      options: {
        gitSummaries: () => {
          throw new Error("git summaries exploded");
        },
      },
      seq: 7,
      legacyBulkReadAdmission: admission,
    } as unknown as RemoteServerContext;
    await expect(
      handleLegacyAdmittedShellSnapshot(callFor(ctx, new FakeResponse())),
    ).rejects.toThrow(/git summaries exploded/u);
    expect(admission.usage().active).toBe(0);
  });

  it("does not admit a declared bounded request even under legacy saturation", async () => {
    const admission = new LegacyBulkReadAdmission();
    const held = [admission.tryAdmit("alice"), admission.tryAdmit("bob")];
    const res = new FakeResponse();
    await handleLegacyAdmittedShellSnapshot(
      callFor(context(admission), res, "normal", "/api/snapshot?reads=bounded-v1"),
    );
    expect(res.body).toContain('"reads"');
    expect(admission.usage().refused).toBe(0);
    for (const lease of held) lease.release();
  });

  it("serves a paged legacy snapshot whose over-cap row is outside the page lookahead", async () => {
    const admission = new LegacyBulkReadAdmission();
    dbUpsertThread({ ...threadFixture(2), title: `huge-${"x".repeat(65 * 1024 * 1024)}` }, 2);
    const res = new FakeResponse();
    const pending = handleLegacyAdmittedShellSnapshot(
      callFor(context(admission), res, "legacy-bulk", "/api/snapshot?threadLimit=1"),
    );
    await Promise.resolve();
    res.finish();
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"threads"');
    expect(admission.usage()).toMatchObject({ admitted: 1, refused: 0, aborted: 0 });
  });

  it("serves runtimePage history with omitScrollback without charging the transcript", async () => {
    const admission = new LegacyBulkReadAdmission();
    getSqlite()
      .prepare(
        `INSERT INTO thread_terminal_scrollback (thread_id, transcript, output_length)
         VALUES (?, ?, ?)`,
      )
      .run("thread-0000", "x".repeat(65 * 1024 * 1024), 65 * 1024 * 1024);

    const omittedRes = new FakeResponse();
    const omittedPending = handleLegacyAdmittedThreadHistory(
      callFor(
        historyContext(admission),
        omittedRes,
        "legacy-bulk",
        "/api/threads/thread-0000/history?runtimePage=1&omitScrollback=1",
        { threadId: "thread-0000" },
      ),
    );
    await Promise.resolve();
    omittedRes.finish();
    await omittedPending;
    expect(omittedRes.statusCode).toBe(200);
    expect(omittedRes.body).not.toContain('"terminalScrollback"');
    expect(admission.usage()).toMatchObject({ admitted: 1, aborted: 0 });

    const keptRes = new FakeResponse();
    await handleLegacyAdmittedThreadHistory(
      callFor(
        historyContext(admission),
        keptRes,
        "legacy-bulk",
        "/api/threads/thread-0000/history?runtimePage=1",
        { threadId: "thread-0000" },
      ),
    );
    expect(keptRes.statusCode).toBe(503);
    expect(keptRes.body).toContain(LEGACY_READ_TOO_LARGE_CODE);
    expect(admission.usage()).toMatchObject({ admitted: 2, active: 0 });
  });

  it("rejects invalid legacy bounds with the handler's 400 before admission", async () => {
    const admission = new LegacyBulkReadAdmission();
    dbUpsertThread({ ...threadFixture(2), title: `huge-${"x".repeat(65 * 1024 * 1024)}` }, 2);
    await expect(
      handleLegacyAdmittedShellSnapshot(
        callFor(
          context(admission),
          new FakeResponse(),
          "legacy-bulk",
          "/api/snapshot?threadLimit=abc",
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_thread_limit", status: 400 });
    expect(admission.usage()).toMatchObject({ admitted: 0, active: 0 });

    await expect(
      handleLegacyAdmittedThreadHistory(
        callFor(
          historyContext(admission),
          new FakeResponse(),
          "legacy-bulk",
          "/api/threads/thread-0000/history?runtimePage=1&targetTimelineEntryCount=abc",
          { threadId: "thread-0000" },
        ),
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(admission.usage()).toMatchObject({ admitted: 0, active: 0 });
  });

  it("refuses an over-reservation legacy read with the labelled typed body", async () => {
    const admission = new LegacyBulkReadAdmission();
    // The wrapper uses the contract cap; a 65 MiB stored title exceeds it and
    // must be refused before materialization with the stored-byte label.
    dbUpsertThread(
      { ...threadFixture(99), id: "thread-huge", title: `huge-${"x".repeat(65 * 1024 * 1024)}` },
      99,
    );
    const res = new FakeResponse();
    await handleLegacyAdmittedShellSnapshot(callFor(context(admission), res));
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body) as {
      error: { code: string };
      legacyRead: Record<string, unknown>;
    };
    expect(body.error.code).toBe(LEGACY_READ_TOO_LARGE_CODE);
    expect(body.legacyRead).toMatchObject({
      resource: "catalog",
      charge: "stored-bytes",
      meaning: "conservative-stored-byte-reservation-not-serialized-size",
    });
    expect(body.legacyRead.reservationBytes).toBeGreaterThan(64 * 1024 * 1024);
    expect(res.body).not.toContain('"threads"');
    expect(admission.usage().active).toBe(0);
  });
});
