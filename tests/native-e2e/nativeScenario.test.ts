import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_WS_FIXTURES } from "./harness/wsFixtures.ts";
import { buildReplayableEvent } from "./harness/labFixtures.ts";
import { collectSecretViolations } from "./harness/secrets.ts";
import { sortedUniqueCodePoints } from "./harness/sort.ts";
import { NATIVE_E2E_SCENARIO_API_VERSION } from "./harness/versions.ts";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import {
  exchangeToken,
  controlRequest,
  issueTicket,
  openBufferedSocket,
  openReadySocket,
  startLab,
} from "./helpers/testClient.ts";
import { expectScenarioConflict, waitForSocketOpen } from "./helpers/nativeScenarioTest.ts";
import type { NativeScenarioState, ScenarioActionResult } from "./harness/nativeScenario.ts";

describe("native mobile scenario control API", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("requires the Harness capability and keeps state secret-free", async () => {
    harness = await startLab();
    const unauthenticated = await fetch(new URL("/v1/scenario/state", harness.controlUrl));
    expect(unauthenticated.status).toBe(401);

    const descriptor = await controlRequest(harness, "/v1/scenario");
    expect(descriptor.status).toBe(200);
    expect(await descriptor.json()).toMatchObject({
      formatVersion: 1,
      statePath: "/v1/scenario/state",
      actionPath: "/v1/scenario/actions",
      pairing: "action-result-only",
    });

    const state = await scenarioState(harness);
    expect(collectSecretViolations(state)).toEqual([]);
    expect(JSON.stringify(state)).not.toMatch(/lc_(pair|access|ws)_/);
    expect(state).not.toHaveProperty("pairingUrl");
    expect(state).not.toHaveProperty("accessToken");
    expect(state).not.toHaveProperty("ticket");
  });

  it("keeps additive per-host observations on scenario API version 1", async () => {
    harness = await startLab();
    const descriptor = await controlRequest(harness, "/v1/scenario");
    const state = await scenarioState(harness);

    expect(NATIVE_E2E_SCENARIO_API_VERSION).toBe(1);
    expect((await descriptor.json()).formatVersion).toBe(NATIVE_E2E_SCENARIO_API_VERSION);
    expect(state.formatVersion).toBe(NATIVE_E2E_SCENARIO_API_VERSION);
    expect(state.hosts[0]?.observedOperationIds).toEqual([]);
    expect(state.hosts[0]?.operationJournal).toEqual([]);
  });

  it("journals exact ordered HTTP and WebSocket operations without credentials", async () => {
    harness = await startLab();
    const token = await pairThroughControl(harness);
    const socket = await openReadySocket(harness, token);
    socket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES.ping));
    expect(await socket.next()).toMatchObject({ type: "pong" });

    const journal = (await scenarioState(harness)).hosts[0]!.operationJournal;
    expect(journal.map((entry) => entry.operationId)).toEqual(
      expect.arrayContaining([
        "route:token-exchange",
        "route:websocket-ticket",
        "ws:connect",
        "ws-server:ready",
        "ws-client:ping",
        "ws-server:pong",
      ]),
    );
    expect(journal.find((entry) => entry.operationId === "route:token-exchange")).toMatchObject({
      method: "POST",
      path: "/oauth/token",
    });
    expect(journal.find((entry) => entry.operationId === "ws:connect")).toMatchObject({
      path: "/ws",
      lastSeenSeq: null,
    });
    expect(collectSecretViolations(journal)).toEqual([]);
    socket.ws.close();
  });

  it("returns pairing only from an authorized idempotent action and resets deterministically", async () => {
    harness = await startLab();
    const first = await scenarioAction(harness, { type: "pairing-url", requestId: "pair-1" });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as ScenarioActionResult;
    expect(firstBody.pairingUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(firstBody.state).not.toHaveProperty("pairingUrl");

    const repeated = await scenarioAction(harness, { type: "pairing-url", requestId: "pair-1" });
    expect(await repeated.json()).toEqual(firstBody);

    const reset = await scenarioAction(harness, { type: "reset", requestId: "reset-1" });
    const resetBody = (await reset.json()) as ScenarioActionResult;
    const resetAgain = await scenarioAction(harness, { type: "reset", requestId: "reset-1" });
    expect(await resetAgain.json()).toEqual(resetBody);
    expect(resetBody.state.pairingState).toBe("pairable");
    expect(resetBody.state.hosts).toHaveLength(1);
  });

  it("seeds two real loopback hosts with isolated routing identities and colliding threads", async () => {
    harness = await startLab();
    const response = await scenarioAction(harness, { type: "seed-multihost-collision" });
    expect(response.status).toBe(200);
    const state = ((await response.json()) as ScenarioActionResult).state;
    expect(state.hosts).toHaveLength(2);
    expect(state.hosts[0]?.remoteThreadIds).toEqual(state.hosts[1]?.remoteThreadIds);
    expect(state.hosts[0]?.clientConnectionId).not.toBe(state.hosts[1]?.clientConnectionId);
    expect(state.hosts[0]?.desktopId).not.toBe(state.hosts[1]?.desktopId);
    expect(state.hosts[0]?.httpBaseUrl).not.toBe(state.hosts[1]?.httpBaseUrl);

    for (const host of state.hosts) {
      const pairing = await scenarioAction(harness, { type: "pairing-url", hostId: host.hostId });
      const pairingBody = (await pairing.json()) as ScenarioActionResult;
      const token = await exchangeToken(
        host.httpBaseUrl,
        pairingTokenFromUrl(pairingBody.pairingUrl!),
      );
      expect(token.status).toBe(200);
      const environment = await fetch(
        new URL("/.well-known/poracode/environment", host.httpBaseUrl),
      );
      expect(environment.status).toBe(200);
      expect((await environment.json()).desktopId).toBe(host.desktopId);
    }
  });

  it("observes collision-only HTTP/WebSocket traffic, unions hosts, and isolates reset/reseed", async () => {
    harness = await startLab();
    const seeded = (await (
      await scenarioAction(harness, { type: "seed-multihost-collision" })
    ).json()) as ScenarioActionResult;
    const primaryHost = seeded.state.hosts.find((host) => host.hostId === "primary")!;
    const collisionHost = seeded.state.hosts.find((host) => host.hostId === "collision-b")!;
    const primaryEnv = await fetch(
      new URL("/.well-known/poracode/environment", primaryHost.httpBaseUrl),
    );
    const collisionEnv = await fetch(
      new URL("/.well-known/poracode/environment", collisionHost.httpBaseUrl),
    );
    expect(primaryEnv.status).toBe(200);
    expect(collisionEnv.status).toBe(200);

    const primaryToken = await pairThroughControl(harness);
    const primarySocket = await openReadySocket(harness, primaryToken);
    primarySocket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES.ping));
    expect(await primarySocket.next()).toMatchObject({ type: "pong" });

    const collisionPairing = await scenarioAction(harness, {
      type: "pairing-url",
      hostId: "collision-b",
    });
    const collisionPairingBody = (await collisionPairing.json()) as ScenarioActionResult;
    const collisionToken = await exchangeToken(
      collisionHost.httpBaseUrl,
      pairingTokenFromUrl(collisionPairingBody.pairingUrl!),
      ["session:read"],
    );
    expect(collisionToken.status).toBe(200);
    const collisionTicket = await issueTicket(
      collisionHost.httpBaseUrl,
      collisionToken.accessToken,
    );
    const collisionSocket = openBufferedSocket(collisionHost.wsBaseUrl, collisionTicket.ticket);
    await waitForSocketOpen(collisionSocket.ws);
    expect(await collisionSocket.next()).toMatchObject({ type: "ready" });

    const pending = harness.scenario.execute({
      type: "await",
      condition: { kind: "operations-observed", operationIds: ["ws-client:browser-watch"] },
      timeoutMs: 2_000,
    });
    await Promise.resolve();
    collisionSocket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["browser-watch"]));
    for (let index = 0; index < 3; index += 1) await collisionSocket.next();
    const awaited = await pending;
    expect(
      awaited.state.hosts.find((host) => host.hostId === "primary")?.observedOperationIds,
    ).not.toContain("ws-client:browser-watch");
    expect(
      awaited.state.hosts.find((host) => host.hostId === "collision-b")?.observedOperationIds,
    ).toContain("ws-client:browser-watch");
    expect(awaited.state.observedOperationIds).toEqual(
      sortedUniqueCodePoints(awaited.state.hosts.flatMap((host) => host.observedOperationIds)),
    );
    expect(awaited.state.observedOperationIds).toEqual(
      expect.arrayContaining(["route:environment", "ws-client:ping", "ws-client:browser-watch"]),
    );
    expect(
      awaited.state.observedOperationIds.filter(
        (operationId) => operationId === "route:environment",
      ),
    ).toHaveLength(1);

    primarySocket.ws.close();
    collisionSocket.ws.close();
    const reset = await scenarioAction(harness, { type: "reset" });
    const resetState = ((await reset.json()) as ScenarioActionResult).state;
    expect(resetState.hosts).toHaveLength(1);
    expect(resetState.observedOperationIds).not.toContain("ws-client:browser-watch");
    expect(resetState.observedOperationIds).not.toContain("route:environment");
    const hiddenAwait = await scenarioAction(harness, {
      type: "await",
      condition: { kind: "operations-observed", operationIds: ["ws-client:browser-watch"] },
      timeoutMs: 10,
    });
    expect(hiddenAwait.status).toBe(408);
    expect(await hiddenAwait.json()).toEqual({
      error: { code: "await_timeout", message: "Scenario await timed out." },
    });

    const reseeded = await scenarioAction(harness, { type: "seed-multihost-collision" });
    const reseededState = ((await reseeded.json()) as ScenarioActionResult).state;
    const reseededCollision = reseededState.hosts.find((host) => host.hostId === "collision-b")!;
    expect(reseededCollision.observedOperationIds).not.toContain("ws-client:browser-watch");
    expect(reseededState.observedOperationIds).not.toContain("ws-client:browser-watch");
    expect(harness.lab.ledger.listenerCount).toBe(1);
    expect(harness.collisionLab?.ledger.listenerCount).toBe(1);

    const reseedPairing = await scenarioAction(harness, {
      type: "pairing-url",
      hostId: "collision-b",
    });
    const reseedPairingBody = (await reseedPairing.json()) as ScenarioActionResult;
    const reseedToken = await exchangeToken(
      reseededCollision.httpBaseUrl,
      pairingTokenFromUrl(reseedPairingBody.pairingUrl!),
      ["session:read"],
    );
    const reseedTicket = await issueTicket(reseededCollision.httpBaseUrl, reseedToken.accessToken);
    const reseedSocket = openBufferedSocket(reseededCollision.wsBaseUrl, reseedTicket.ticket);
    await waitForSocketOpen(reseedSocket.ws);
    await reseedSocket.next();
    const revisionBeforeReseedOperation = (await scenarioState(harness)).revision;
    const reseedPending = harness.scenario.execute({
      type: "await",
      condition: { kind: "operations-observed", operationIds: ["ws-client:ping"] },
      timeoutMs: 2_000,
    });
    await Promise.resolve();
    reseedSocket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES.ping));
    expect(await reseedSocket.next()).toMatchObject({ type: "pong" });
    const reseedObserved = await reseedPending;
    expect(reseedObserved.revision).toBe(revisionBeforeReseedOperation + 2);
    reseedSocket.ws.close();
  });

  it("replays exact request results and rejects every material parameter conflict", async () => {
    harness = await startLab();
    const firstPairing = await scenarioAction(harness, {
      type: "pairing-url",
      requestId: "same-pairing",
    });
    const firstPairingBody = await firstPairing.json();
    const replayPairing = await scenarioAction(harness, {
      type: "pairing-url",
      hostId: "primary",
      requestId: "same-pairing",
    });
    expect(await replayPairing.json()).toEqual(firstPairingBody);

    await scenarioAction(harness, { type: "seed-multihost-collision" });
    await scenarioAction(harness, { type: "pairing-url", hostId: "primary", requestId: "host" });
    await expectScenarioConflict(harness, {
      type: "pairing-url",
      hostId: "collision-b",
      requestId: "host",
    });

    await scenarioAction(harness, {
      type: "emit-canonical-replay",
      threadId: "thread-a",
      requestId: "thread",
    });
    await expectScenarioConflict(harness, {
      type: "emit-canonical-replay",
      threadId: "thread-b",
      requestId: "thread",
    });

    await scenarioAction(harness, {
      type: "declare-observations",
      operationIds: ["ws-client:browser-watch", "ws-client:browser-input"],
      requestId: "operations",
    });
    const equivalentOperations = await scenarioAction(harness, {
      type: "declare-observations",
      operationIds: ["ws-client:browser-input", "ws-client:browser-watch"],
      requestId: "operations",
    });
    expect((await equivalentOperations.json()).action).toBe("declare-observations");
    await expectScenarioConflict(harness, {
      type: "declare-observations",
      operationIds: ["ws-client:git-state-interests"],
      requestId: "operations",
    });

    await scenarioAction(harness, {
      type: "activate-fault",
      fixtureId: "reconnect-race",
      requestId: "fault",
    });
    await expectScenarioConflict(harness, {
      type: "activate-fault",
      fixtureId: "interest-race",
      requestId: "fault",
    });

    const currentRevision = (await scenarioState(harness)).revision;
    await scenarioAction(harness, {
      type: "await",
      condition: { kind: "revision-at-least", revision: currentRevision },
      requestId: "condition",
    });
    await expectScenarioConflict(harness, {
      type: "await",
      condition: { kind: "pairing-state", state: "pairable" },
      requestId: "condition",
    });

    await scenarioAction(harness, {
      type: "await",
      condition: { kind: "revision-at-least", revision: currentRevision },
      timeoutMs: 10,
      requestId: "timeout",
    });
    await expectScenarioConflict(harness, {
      type: "await",
      condition: { kind: "revision-at-least", revision: currentRevision },
      timeoutMs: 11,
      requestId: "timeout",
    });

    await scenarioAction(harness, { type: "reset", requestId: "action-type" });
    await expectScenarioConflict(harness, { type: "clear-faults", requestId: "action-type" });
  });

  it("stopping wakes awaits, tears down both listeners, and stops collision", async () => {
    harness = await startLab();
    const seeded = (await (
      await scenarioAction(harness, { type: "seed-multihost-collision" })
    ).json()) as ScenarioActionResult;
    const collisionUrl = seeded.state.hosts.find(
      (host) => host.hostId === "collision-b",
    )!.httpBaseUrl;
    const pending = harness.scenario.execute({
      type: "await",
      condition: { kind: "revision-at-least", revision: Number.MAX_SAFE_INTEGER },
      timeoutMs: 120_000,
    });
    await Promise.resolve();
    await harness.scenario.stop();
    await expect(pending).rejects.toMatchObject({
      code: "scenario_stopped",
      message: "Scenario stopped.",
      status: 409,
    });
    expect(harness.lab.ledger.listenerCount).toBe(0);
    expect(harness.collisionLab?.ledger.listenerCount).toBe(0);
    await expect(harness.scenario.stop()).resolves.toBeUndefined();
    await expect(fetch(new URL("/.well-known/poracode/environment", collisionUrl))).rejects.toThrow(
      "fetch failed",
    );

    const revision = harness.scenario.state().revision;
    harness.lab.publishEvent(buildReplayableEvent("thread-state"));
    expect(harness.scenario.state().revision).toBe(revision);
  });

  it("emits the seven canonical replay events in sequence over a real WebSocket", async () => {
    harness = await startLab();
    const accessToken = await pairThroughControl(harness);
    const socket = await openReadySocket(harness, accessToken);
    const emitted = await scenarioAction(harness, { type: "emit-canonical-replay" });
    const body = (await emitted.json()) as ScenarioActionResult;
    expect(body.eventTypes).toEqual([
      "thread-reset",
      "thread-exited",
      "agent-status-updated",
      "windows-agent-statuses",
      "wsl-agent-statuses",
      "remote-git-summaries",
      "remote-git-state",
    ]);
    const events: string[] = [];
    const seqs: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      const message = (await socket.next()) as {
        type: string;
        seq: number;
        event: { type: string };
      };
      expect(message.type).toBe("event");
      events.push(message.event.type);
      seqs.push(message.seq);
    }
    expect(events).toEqual(body.eventTypes);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
    socket.ws.close();
  });

  it("declares and observes browser and git operations through the existing ledger", async () => {
    harness = await startLab();
    const accessToken = await pairThroughControl(harness);
    const socket = await openReadySocket(harness, accessToken);
    await scenarioAction(harness, {
      type: "declare-observations",
      operationIds: [
        "ws-client:git-state-interests",
        "ws-client:browser-watch",
        "ws-client:browser-unwatch",
        "ws-client:browser-input",
      ],
    });
    socket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["browser-watch"]));
    for (let index = 0; index < 3; index += 1) await socket.next();
    socket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["browser-unwatch"]));
    socket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["browser-input"]));
    socket.ws.send(JSON.stringify(CLIENT_WS_FIXTURES["git-state-interests"]));

    const awaited = await scenarioAction(harness, {
      type: "await",
      condition: {
        kind: "operations-observed",
        operationIds: [
          "ws-client:git-state-interests",
          "ws-client:browser-watch",
          "ws-client:browser-unwatch",
          "ws-client:browser-input",
        ],
      },
      timeoutMs: 2_000,
    });
    expect(awaited.status).toBe(200);
    const state = ((await awaited.json()) as ScenarioActionResult).state;
    expect(state.observedOperationIds).toEqual(
      expect.arrayContaining([
        "ws-client:git-state-interests",
        "ws-client:browser-watch",
        "ws-client:browser-unwatch",
        "ws-client:browser-input",
      ]),
    );
    expect(JSON.stringify(state)).not.toContain("ZmFrZS1qcGVn");
    socket.ws.close();
  });

  it("delegates reconnect-safe faults to the existing allowlisted fault engine", async () => {
    harness = await startLab();
    const activated = await scenarioAction(harness, {
      type: "activate-fault",
      fixtureId: "reconnect-race",
    });
    expect(((await activated.json()) as ScenarioActionResult).state.faults).toContain(
      "reconnect-race",
    );
    const cleared = await scenarioAction(harness, { type: "clear-faults" });
    expect(((await cleared.json()) as ScenarioActionResult).state.faults).toEqual([]);
  });

  it("has deterministic await timeout and cancellation semantics", async () => {
    harness = await startLab();
    const timeout = await scenarioAction(harness, {
      type: "await",
      condition: { kind: "revision-at-least", revision: 999_999 },
      timeoutMs: 10,
    });
    expect(timeout.status).toBe(408);
    expect(await timeout.json()).toEqual({
      error: { code: "await_timeout", message: "Scenario await timed out." },
    });

    const controller = new AbortController();
    const pending = harness.scenario.execute(
      {
        type: "await",
        condition: { kind: "revision-at-least", revision: 999_999 },
        timeoutMs: 1_000,
      },
      controller.signal,
    );
    queueMicrotask(() => controller.abort());
    await expect(pending).rejects.toMatchObject({ code: "await_cancelled", status: 499 });
  });
});

async function scenarioAction(
  harness: Awaited<ReturnType<typeof startLab>>,
  action: Record<string, unknown>,
): Promise<Response> {
  return controlRequest(harness, "/v1/scenario/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}

async function scenarioState(
  harness: Awaited<ReturnType<typeof startLab>>,
): Promise<NativeScenarioState> {
  const response = await controlRequest(harness, "/v1/scenario/state");
  expect(response.status).toBe(200);
  return (await response.json()) as NativeScenarioState;
}

async function pairThroughControl(harness: Awaited<ReturnType<typeof startLab>>): Promise<string> {
  const pairing = await scenarioAction(harness, { type: "pairing-url" });
  expect(pairing.status).toBe(200);
  const body = (await pairing.json()) as ScenarioActionResult;
  const token = await exchangeToken(harness.httpBaseUrl, pairingTokenFromUrl(body.pairingUrl!), [
    "session:read",
  ]);
  expect(token.status).toBe(200);
  return token.accessToken;
}
