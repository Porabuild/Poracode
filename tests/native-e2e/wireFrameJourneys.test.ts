import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_TERMINAL_ID, FIXTURE_THREAD_ID } from "./harness/labFixtures.ts";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

/**
 * UI-level journey scripts for the frame-fixture families the native
 * journeys drive through the harness control plane. Each journey performs
 * the exact control-plane calls the XCUITest journey issues (`/v1/frames/*`,
 * `/v1/scenario/state`) and asserts the observable wire behavior plus the
 * operation journal a UI journey polls. The on-device rendering assertions
 * remain CI-only (ios-ui job in `.github/workflows/native-ci.yml`).
 */

type Harness = Awaited<ReturnType<typeof startLab>>;

async function controlJson(
  harness: Harness,
  path: string,
  init?: { readonly method?: string },
): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, harness.controlUrl), {
    ...(init?.method ? { method: init.method } : {}),
    headers: { authorization: `Harness ${harness.capability}` },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function postFrame(harness: Harness, frameId: string): Promise<void> {
  await controlJson(harness, `/v1/frames/${frameId}`, { method: "POST" });
}

async function journalOperationCount(harness: Harness, operationId: string): Promise<number> {
  const state = await controlJson(harness, "/v1/scenario/state");
  const hosts = state.hosts as Array<{
    readonly hostId: string;
    readonly operationJournal: ReadonlyArray<{ readonly operationId: string }>;
  }>;
  const primary = hosts.find((host) => host.hostId === "primary");
  expect(primary).toBeDefined();
  return primary!.operationJournal.filter((entry) => entry.operationId === operationId).length;
}

async function waitForJournal(harness: Harness, operationId: string, count: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await journalOperationCount(harness, operationId)) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(await journalOperationCount(harness, operationId)).toBeGreaterThanOrEqual(count);
}

describe("wire-lab control-plane journeys", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("request journey: opened fixture raises the prompt and resolved resolves it", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const { next } = await openReadySocket(harness, accessToken);

    await postFrame(harness, "runtime-live-request-opened");
    const opened = (await next()) as {
      type: string;
      event: {
        type: string;
        event: { type: string; requestId: string; requestType: string; payload: unknown };
      };
    };
    expect(opened.type).toBe("event");
    expect(opened.event.type).toBe("thread-runtime-event");
    expect(opened.event.event.type).toBe("request.opened");
    expect(opened.event.event.requestId).toBe("request-fixture-001");
    expect(opened.event.event.requestType).toBe("command_execution_approval");
    await waitForJournal(harness, "runtime:request.opened", 1);

    await postFrame(harness, "runtime-live-request-resolved");
    const resolved = (await next()) as {
      type: string;
      event: { event: { type: string; requestId: string; outcome: string } };
    };
    expect(resolved.event.event.type).toBe("request.resolved");
    expect(resolved.event.event.requestId).toBe("request-fixture-001");
    expect(resolved.event.event.outcome).toBe("accepted");
    await waitForJournal(harness, "runtime:request.resolved", 1);
  });

  it("steer journey: set stores and broadcasts the pending envelope, clear releases it", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const { next } = await openReadySocket(harness, accessToken);

    // The client-side mutation the UI journey drives from the composer.
    const setResponse = await fetch(
      new URL(`/api/threads/${FIXTURE_THREAD_ID}/steer/set`, harness.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Journey steer",
          segments: [{ kind: "text", content: "Journey steer" }],
          config: { model: "gpt-5" },
        }),
      },
    );
    expect(setResponse.status).toBe(200);
    await waitForJournal(harness, "route:thread-steer-set", 1);

    // The host broadcast the journey asserts on, delivered as a frame fixture
    // so the rendering step is deterministic.
    await postFrame(harness, "event-thread-pending-steer");
    const staged = (await next()) as {
      type: string;
      event: {
        type: string;
        pending: { id: string; prompt: string; stagedAt: number } | null;
      };
    };
    expect(staged.event.type).toBe("thread-pending-steer");
    expect(staged.event.pending).toMatchObject({ id: "steer-fixture-001", prompt: "steer" });

    const clearResponse = await fetch(
      new URL(`/api/threads/${FIXTURE_THREAD_ID}/steer/clear`, harness.httpBaseUrl),
      {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    expect(clearResponse.status).toBe(200);
    await waitForJournal(harness, "route:thread-steer-clear", 1);

    await postFrame(harness, "event-thread-pending-steer-cleared");
    const cleared = (await next()) as {
      type: string;
      event: { type: string; pending: unknown };
    };
    expect(cleared.event.type).toBe("thread-pending-steer");
    expect(cleared.event.pending).toBeNull();
  });

  it("terminal-watch journey: handshake, live output, v2 baseline, ack window, desktop gate", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "terminal:read"]);
    const { next, ws } = await openReadySocket(harness, accessToken);

    // Cursor-sync v1 handshake: the app's terminal screen watches on open.
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: FIXTURE_TERMINAL_ID,
        cursorSync: { version: 1, watchId: "watch-fixture-001" },
      }),
    );
    expect(await next()).toMatchObject({
      type: "terminal-watch-result",
      id: FIXTURE_TERMINAL_ID,
      cursorSync: {
        version: 1,
        result: { status: "ready", data: "hello world", toCursor: 11 },
      },
    });
    await waitForJournal(harness, "ws-client:terminal-watch", 1);
    await waitForJournal(harness, "ws-server:terminal-watch-result", 1);

    await postFrame(harness, "terminal-output");
    expect(await next()).toMatchObject({
      type: "terminal-output",
      id: FIXTURE_TERMINAL_ID,
      data: "live frame",
    });

    // Cursor-sync v2: chunked baseline plus the ack-released window.
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: FIXTURE_TERMINAL_ID,
        cursorSync: {
          version: 2,
          watchId: "watch-fixture-002",
          maxChunkBytes: 8192,
          maxWindowBytes: 8192,
        },
      }),
    );
    const baseline = (await next()) as {
      type: string;
      cursorSync: { version: number; toCursor: number; data: string };
    };
    expect(baseline.type).toBe("terminal-watch-baseline-chunk");
    expect(baseline.cursorSync).toMatchObject({ version: 2, toCursor: 11, data: "hello world" });
    ws.send(
      JSON.stringify({
        type: "terminal-watch-baseline-ack",
        id: FIXTURE_TERMINAL_ID,
        cursorSync: { version: 2, watchId: "watch-fixture-002", throughCursor: 11 },
      }),
    );
    const window = (await next()) as {
      type: string;
      cursorSync: { fromCursor: number; toCursor: number; data: string };
    };
    expect(window.type).toBe("terminal-watch-baseline-chunk");
    expect(window.cursorSync).toMatchObject({
      fromCursor: 11,
      toCursor: 22,
      data: "live window",
    });
    await waitForJournal(harness, "ws-client:terminal-watch-baseline-ack", 1);
    ws.send(JSON.stringify({ type: "terminal-unwatch", id: FIXTURE_TERMINAL_ID }));

    // Desktop-internal gate: the frame fixture delivers only to opted-in
    // sessions, and the pong barrier proves the native socket saw nothing.
    await postFrame(harness, "desktop-event");
    ws.send(JSON.stringify({ type: "ping", id: "gate-barrier" }));
    expect(await next()).toMatchObject({ type: "pong", id: "gate-barrier" });
    const desktop = await openReadySocket(harness, accessToken, { desktopInternal: true });
    await postFrame(harness, "desktop-event");
    expect(await desktop.next()).toMatchObject({
      type: "desktop-event",
      seq: 1,
      event: { type: "thread-state" },
    });
    desktop.ws.close();
    ws.close();
  });
});
