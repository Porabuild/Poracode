import { afterEach, describe, expect, it } from "vitest";
import { GET_GIT_STATUS_PAYLOAD } from "./harness/contractFixtures.ts";
import { loadProtocolManifest } from "./harness/manifest.ts";
import { buildRuntimeEvent } from "./harness/labFixtures.ts";
import { sortCodePoints } from "./harness/sort.ts";
import { pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("coverage ledger exactness", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("loads expected sets from the live manifest rather than hand-maintained counts", async () => {
    harness = await startLab();
    const snapshot = harness.lab.ledger.snapshot();
    const manifest = loadProtocolManifest();
    expect(snapshot.expected.httpRouteIds).toEqual(
      sortCodePoints(manifest.httpRoutes.map((route) => route.id)),
    );
    expect(snapshot.expected.procedureNames).toEqual(
      sortCodePoints(manifest.procedures.map((procedure) => procedure.name)),
    );
    expect(snapshot.expected.webSocketClientTypes).toEqual(
      sortCodePoints(manifest.webSocket.clientMessages),
    );
    expect(snapshot.expected.webSocketServerTypes).toEqual(
      sortCodePoints(manifest.webSocket.serverMessages),
    );
    expect(snapshot.expected.replayableEventTypes).toEqual(
      sortCodePoints(manifest.webSocket.replayableEventTypes),
    );
    expect(snapshot.expected.runtimeEventTypes).toEqual(
      sortCodePoints(manifest.webSocket.runtimeEventTypes),
    );
    expect(snapshot.keyCount).toBe(201);
    expect(snapshot.complete).toBe(false);
    expect(
      Object.values(snapshot.operations).every((record) => record.status === "unexercised"),
    ).toBe(true);
  });

  it("records observed routes, procedures, envelopes, and flags unknowns", async () => {
    harness = await startLab();
    await fetch(new URL("/.well-known/poracode/environment", harness.httpBaseUrl));
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ procedure: "getGitStatus", payload: GET_GIT_STATUS_PAYLOAD }),
    });
    await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ procedure: "notARealProcedure", payload: {} }),
    });
    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: "thread-fixture-001",
      event: buildRuntimeEvent("content.delta"),
    });
    harness.lab.ledger.observeWebSocketClient("not-a-client-type");

    const snapshot = harness.lab.ledger.snapshot();
    expect(snapshot.covered.httpRouteIds).toEqual(
      expect.arrayContaining(["environment", "token-exchange", "procedure-call"]),
    );
    expect(snapshot.covered.procedureNames).toContain("getGitStatus");
    expect(snapshot.unknown.procedureNames).toContain("notARealProcedure");
    expect(snapshot.unknown.webSocketClientTypes).toContain("not-a-client-type");
    expect(snapshot.covered.replayableEventTypes).toContain("thread-runtime-event");
    expect(snapshot.covered.runtimeEventTypes).toContain("content.delta");
    expect(snapshot.missing.httpRouteIds).not.toContain("environment");
    expect(snapshot.missing.procedureNames).not.toContain("getGitStatus");
    expect(snapshot.complete).toBe(false);
    expect(snapshot.foundationComplete).toBe(false);
  });
});
