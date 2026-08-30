import { afterEach, describe, expect, it } from "vitest";
import { GET_GIT_STATUS_PAYLOAD, GIT_STAGE_PAYLOAD } from "./harness/contractFixtures.ts";
import {
  buildRuntimeEvent,
  FIXTURE_TERMINAL_ID,
  FIXTURE_THREAD_ID,
} from "./harness/labFixtures.ts";
import { FOUNDATION_OPERATION_KEYS } from "./harness/operationMap.ts";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("foundation coverage ledger completeness", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("marks every foundation key passed and keeps full-parity incomplete", async () => {
    harness = await startLab({ replayLimit: 2 });
    expect(
      (await fetch(new URL("/.well-known/poracode/environment", harness.httpBaseUrl))).status,
    ).toBe(200);
    expect(
      (await fetch(new URL("/.well-known/lightcode/environment", harness.httpBaseUrl))).status,
    ).toBe(200);

    const { accessToken } = await pairAndAuth(harness, [
      "session:read",
      "session:operate",
      "terminal:read",
    ]);
    expect(
      (
        await fetch(new URL("/api/snapshot", harness.httpBaseUrl), {
          headers: { authorization: `Bearer ${accessToken}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(new URL(`/api/threads/${FIXTURE_THREAD_ID}/history`, harness.httpBaseUrl), {
          headers: { authorization: `Bearer ${accessToken}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(
          new URL(`/api/threads/${FIXTURE_THREAD_ID}/history/items?limit=100`, harness.httpBaseUrl),
          {
            headers: { authorization: `Bearer ${accessToken}` },
          },
        )
      ).status,
    ).toBe(200);

    const stage = await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ procedure: "gitStage", payload: GIT_STAGE_PAYLOAD }),
    });
    expect(stage.status).toBe(200);
    const status = await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ procedure: "getGitStatus", payload: GET_GIT_STATUS_PAYLOAD }),
    });
    expect(status.status).toBe(200);

    harness.lab.publishEvent({ type: "thread-state", threadId: FIXTURE_THREAD_ID });
    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: FIXTURE_THREAD_ID,
      event: buildRuntimeEvent("content.delta"),
    });
    harness.lab.publishEvent({ type: "remote-threads-changed", threadIds: [FIXTURE_THREAD_ID] });

    const { ws, next } = await openReadySocket(harness, accessToken, { lastSeenSeq: 0 });
    expect(await next()).toMatchObject({ type: "resync-required" });
    ws.send(JSON.stringify({ type: "ping", id: "foundation" }));
    expect(await next()).toMatchObject({ type: "pong", id: "foundation" });
    ws.send(JSON.stringify({ type: "thread-item-interests", threadIds: [FIXTURE_THREAD_ID] }));
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: FIXTURE_TERMINAL_ID,
        cursorSync: { version: 1, watchId: "watch-fixture-001" },
      }),
    );
    expect(await next()).toMatchObject({ type: "terminal-watch-result", id: FIXTURE_TERMINAL_ID });
    harness.lab.emit({ kind: "terminal-output", terminalId: FIXTURE_TERMINAL_ID, data: "live" });
    expect(await next()).toMatchObject({ type: "terminal-output", id: FIXTURE_TERMINAL_ID });
    ws.send(JSON.stringify({ type: "terminal-unwatch", id: FIXTURE_TERMINAL_ID }));
    ws.send(JSON.stringify({ type: "ping", id: "after-unwatch" }));
    expect(await next()).toMatchObject({ type: "pong", id: "after-unwatch" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "live" });
    expect(await next()).toMatchObject({ type: "event" });
    ws.close();

    const snapshot = harness.lab.ledger.snapshot();
    const incomplete = FOUNDATION_OPERATION_KEYS.filter((key) => {
      const coverageStatus = snapshot.operations[key]?.status;
      return coverageStatus !== "mock-passed" && coverageStatus !== "negative-passed";
    });
    expect(incomplete).toEqual([]);
    expect(snapshot.foundationComplete).toBe(true);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.keyCount).toBe(207);
  });
});
