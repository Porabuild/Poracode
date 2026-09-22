import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { dbApplyThreadRuntimeEvents } from "@/host/db/runtimeItems";
import {
  beginRuntimeFence,
  releaseRuntimeFence,
  resetRuntimePersistenceForTests,
} from "@/host/db/runtimePersistenceRuntime";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
} from "@/host/db/runtimePersistenceTypes";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

/**
 * D1 route regression: every typed B1 persistence refusal that can reach a
 * remote route must be a truthful retryable 503 (with `Retry-After`), never an
 * opaque 500. Read paths (history snapshot and runtime pages) refuse on
 * exhausted fence waiters; mutation routes map busy/degraded/contaminated from
 * the persistence gate. The checkpoint-revert route additionally proves the
 * receipt classification is preserved: the dispatch mark already recorded the
 * command as uncertain before the mapped 503 is written.
 */
const THREAD = "thread-refusals";

function started(itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId: THREAD,
    itemId,
    itemType: "assistant_message",
  } as RuntimeEvent;
}

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:operate", "session:read"],
      client: { label: "Refusal test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function receiptState(commandId: string): string | undefined {
  return (
    getSqlite()
      .prepare("SELECT state FROM remote_command_receipts WHERE command_id = ?")
      .get(commandId) as { state: string } | undefined
  )?.state;
}

describe.skipIf(!sqliteAvailable)("thread route persistence-refusal mapping", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let server: RemoteAccessServer;
  let truncateImpl: (threadId: string, itemId: string) => void;
  let revertImpl: (input: {
    threadId: string;
    checkpointItemId: string;
    operationKey: string;
  }) => Promise<unknown>;
  let revertCalls: number;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-route-refusals-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Refusal project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: THREAD }, 0);
    resetRuntimePersistenceForTests();
    truncateImpl = () => {};
    revertCalls = 0;
    revertImpl = async () => {
      revertCalls += 1;
      return {
        outcome: "completed",
        replayed: false,
        numTurns: 0,
        providerPhase: "skipped_no_turns",
        filesPhase: "completed",
        truncatePhase: "completed",
        removedCompletedTurnAnchors: [],
      };
    };
    server = new RemoteAccessServer({
      truncateThreadRuntime: (threadId, itemId) => truncateImpl(threadId, itemId),
      revertCheckpoint: (input) => revertImpl(input) as never,
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: async () => "" as never,
    } satisfies RemoteAccessServerOptions);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  });

  afterEach(async () => {
    await server.dispose();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const headers = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  const post = (path: string, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
    fetch(new URL(path, info.httpBaseUrl), {
      method: "POST",
      headers: { ...headers(), ...extra },
      body: JSON.stringify(body),
    });

  it("maps exhausted fence waiters on the snapshot and page reads to 503 persistence_busy", async () => {
    dbApplyThreadRuntimeEvents(THREAD, [started("a")]);
    // Saturate the per-thread fence waiter bound (2 queued behind the active
    // fence); the next reader's synchronous beginRuntimeFence throws busy.
    const first = beginRuntimeFence(THREAD);
    const second = beginRuntimeFence(THREAD);
    try {
      const history = await fetch(new URL(`/api/threads/${THREAD}/history`, info.httpBaseUrl), {
        headers: headers(),
      });
      expect(history.status).toBe(503);
      expect(history.headers.get("retry-after")).toBe("1");
      await expect(history.json()).resolves.toMatchObject({
        error: { code: "persistence_busy" },
      });

      const items = await fetch(
        new URL(`/api/threads/${THREAD}/history/items?limit=10`, info.httpBaseUrl),
        { headers: headers() },
      );
      expect(items.status).toBe(503);
      expect(items.headers.get("retry-after")).toBe("1");
      await expect(items.json()).resolves.toMatchObject({
        error: { code: "persistence_busy" },
      });
    } finally {
      releaseRuntimeFence(first);
      releaseRuntimeFence(second);
    }
  });

  it("maps typed truncate refusals to retryable 503s", async () => {
    truncateImpl = () => {
      throw new RuntimePersistenceBusyError(THREAD, "mutation", 250);
    };
    const busy = await post(`/api/threads/${THREAD}/runtime/truncate`, { itemId: "a" });
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("1");
    await expect(busy.json()).resolves.toMatchObject({ error: { code: "persistence_busy" } });

    truncateImpl = () => {
      throw new RuntimePersistenceContaminatedError(THREAD, "thread-bytes", 3, 512, 250);
    };
    const contaminated = await post(`/api/threads/${THREAD}/runtime/truncate`, { itemId: "a" });
    expect(contaminated.status).toBe(503);
    await expect(contaminated.json()).resolves.toMatchObject({
      error: { code: "persistence_contaminated" },
    });

    truncateImpl = () => {
      throw new RuntimePersistenceDegradedError(THREAD, 1, 64, "storage", 500);
    };
    const degraded = await post(`/api/threads/${THREAD}/runtime/truncate`, { itemId: "a" });
    expect(degraded.status).toBe(503);
    expect(degraded.headers.get("retry-after")).toBe("1");
    await expect(degraded.json()).resolves.toMatchObject({
      error: { code: "persistence_degraded" },
    });
  });

  it("maps a typed checkpoint-revert refusal to 503 and preserves the uncertain receipt", async () => {
    revertImpl = async () => {
      revertCalls += 1;
      throw new RuntimePersistenceDegradedError(THREAD, 2, 512, "storage", 500);
    };
    const body = { checkpointItemId: "a", operationKey: "op-refusal-1" };
    const commandId = "cmd-refusal-1";

    const first = await post(`/api/threads/${THREAD}/checkpoint-revert`, body, {
      "x-poracode-command-id": commandId,
    });
    expect(first.status).toBe(503);
    expect(first.headers.get("retry-after")).toBe("1");
    await expect(first.json()).resolves.toMatchObject({ error: { code: "persistence_degraded" } });
    // The dispatch mark fired before the typed refusal, so the receipt is
    // uncertain — a blind resend can never be mistaken for a first execution.
    expect(receiptState(commandId)).toBe("uncertain");
    expect(revertCalls).toBe(1);

    // A same-id retry goes through the route's own reconcile hook (`resume`):
    // the host never re-sends on its own, and the revert journal owns whether
    // the resumed attempt may re-apply a phase.
    const retry = await post(`/api/threads/${THREAD}/checkpoint-revert`, body, {
      "x-poracode-command-id": commandId,
    });
    expect(retry.status).toBe(503);
    expect(revertCalls).toBe(2);
    expect(receiptState(commandId)).toBe("uncertain");
  });
});
