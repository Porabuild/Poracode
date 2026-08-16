import { describe, expect, it } from "vitest";
import {
  controlRequest,
  exchangeToken,
  issueTicket,
  openBufferedSocket,
  openReadySocket,
  readWsMessage,
  startLab,
} from "./helpers/testClient.ts";
import { loadCanonicalParityTape } from "./harness/parityTape.ts";
import { collectSecretViolations } from "./harness/secrets.ts";
import type { ParityActionResult, ParityState } from "./harness/parityController.ts";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";

describe("native parity wire-lab control", () => {
  it("emits the named sequencing cases with ring-owned sequence authority", async () => {
    const harness = await startLab();
    try {
      const descriptor = await controlRequest(harness, "/v1/parity");
      expect(await descriptor.json()).toMatchObject({
        formatVersion: 1,
        statePath: "/v1/parity/state",
        actionPath: "/v1/parity/actions",
      });
      const access = await pairHost(harness.httpBaseUrl, harness);
      const socket = await openReadySocket(harness, access);
      const state = await parityState(harness);
      const socketId = state.hosts[0]!.sockets[0]!.socketId;
      const sessionId = state.hosts[0]!.sockets[0]!.sessionId;
      await emit(harness, { caseId: "ready-does-not-advance", socketId, sessionId });
      expect(await socket.next()).toMatchObject({ type: "ready", seq: 0 });

      const sequenceCases = [
        ["contiguous-one", "applied", 1],
        ["contiguous-two", "applied", 2],
        ["duplicate-two", "duplicate", 2],
        ["gap-four", "gap", 4],
        ["authoritative-resync-four", "resync-required", 4],
        ["post-resync-five", "applied", 5],
      ] as const;
      for (const [caseId, disposition, sequence] of sequenceCases) {
        const result = await emit(harness, { caseId, socketId, sessionId });
        expect(result.emission).toMatchObject({
          caseId,
          disposition,
          sequence,
          replaySequence: sequence,
        });
        expect(await socket.next()).toMatchObject({ seq: sequence });
      }

      const ringBeforeOutOfBand = (await parityState(harness)).hosts[0]!.replaySequence;
      for (const caseId of [
        "browser-state-out-of-band",
        "browser-frame-out-of-band",
        "browser-status-out-of-band",
        "terminal-output-out-of-band",
        "terminal-watch-out-of-band",
      ]) {
        await emit(harness, { caseId, socketId, sessionId });
        expect((await parityState(harness)).hosts[0]!.replaySequence).toBe(ringBeforeOutOfBand);
        expect((await socket.next()) as { type: string }).toMatchObject({
          type: expect.any(String),
        });
      }
    } finally {
      await harness.stop();
    }
  });

  it("emits every canonical server event case through the authenticated socket", async () => {
    const harness = await startLab();
    try {
      const access = await pairHost(harness.httpBaseUrl, harness);
      const socket = await openReadySocket(harness, access);
      const host = (await parityState(harness)).hosts[0]!;
      const identity = host.sockets[0]!;
      const cases = loadCanonicalParityTape().cases.filter(
        (entry) => entry.family !== "git-interests",
      );
      for (const entry of cases) {
        const result = await emit(harness, {
          caseId: entry.id,
          socketId: identity.socketId,
          sessionId: identity.sessionId,
        });
        expect(result.emission?.caseId).toBe(entry.id);
        await socket.next();
      }
      const finalState = (await parityState(harness)).hosts[0]!;
      expect(finalState.emittedCaseIds).toEqual(
        expect.arrayContaining(cases.map((entry) => entry.id)),
      );
      expect(finalState.emittedCaseIds).toEqual([...new Set(finalState.emittedCaseIds)].sort());
      expect(finalState.observedOperationIds).toEqual([...finalState.observedOperationIds].sort());
      socket.ws.close();
    } finally {
      await harness.stop();
    }
  });

  it("observes exact interest variants, empty clearing, order, duplicates, and socket identity", async () => {
    const harness = await startLab();
    try {
      const access = await pairHost(harness.httpBaseUrl, harness);
      const first = await openReadySocket(harness, access);
      const second = await openReadySocket(harness, access);
      const tape = loadCanonicalParityTape();
      const interests = tape.cases.find((entry) => entry.id === "all-wire-variants-with-heavy-pr")!;
      const empty = tape.cases.find((entry) => entry.id === "exact-empty-clear")!;
      first.ws.send(JSON.stringify(interests.message));
      second.ws.send(JSON.stringify(empty.message));
      await flush(first.ws, "interest-one");
      await flush(second.ws, "interest-two");
      const state = await parityState(harness);
      const messages = state.hosts[0]!.observations.messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        socketId: state.hosts[0]!.sockets[0]!.socketId,
        cleared: false,
        targetKeys: expect.any(Array),
        targetLimitExceeded: false,
      });
      expect(messages[0]!.interests).toEqual(interests.message.interests);
      expect(messages[1]).toMatchObject({
        socketId: state.hosts[0]!.sockets[1]!.socketId,
        cleared: true,
        interests: [],
      });
      const duplicate = {
        type: "git-state-interests",
        interests: [
          ...(interests.message.interests as Record<string, unknown>[]).slice(0, 4),
          ...(interests.message.interests as Record<string, unknown>[]).slice(0, 1),
        ],
      };
      first.ws.send(JSON.stringify(duplicate));
      await flush(first.ws, "interest-three");
      const duplicateState = await parityState(harness);
      expect(duplicateState.hosts[0]!.observations.messages[2]).toMatchObject({
        duplicateTargetKeys: ["project-alpha\u0000/repo/shared"],
        targetLimitExceeded: true,
      });
      expect(duplicateState.hosts[0]!.observations.operationIds).toEqual([
        "ws-client:git-state-interests",
      ]);
      expect(duplicateState.hosts[0]!.observedOperationIds).toEqual(
        [...duplicateState.hosts[0]!.observedOperationIds].sort(),
      );
      first.ws.close();
      second.ws.close();
    } finally {
      await harness.stop();
    }
  });

  it("isolates colliding hosts, faults, reset, and late old sockets", async () => {
    const harness = await startLab();
    try {
      const seeded = await scenario(harness, { type: "seed-multihost-collision" });
      await parity(harness, { type: "reset" });
      const hosts = (seeded.state as { hosts: { hostId: string; httpBaseUrl: string }[] }).hosts;
      const primary = hosts.find((host) => host.hostId === "primary")!;
      const collision = hosts.find((host) => host.hostId === "collision-b")!;
      const primaryAccess = await pairHost(primary.httpBaseUrl, harness);
      const collisionAccess = await pairHost(collision.httpBaseUrl, harness);
      const primarySocket = await openReadySocketAt(primary.httpBaseUrl, primaryAccess);
      const collisionSocket = await openReadySocketAt(collision.httpBaseUrl, collisionAccess);
      const before = await parityState(harness);
      const primaryIdentity = before.hosts.find((host) => host.hostId === "primary")!.sockets[0]!;
      const collisionIdentity = before.hosts.find((host) => host.hostId === "collision-b")!
        .sockets[0]!;

      await emit(harness, { hostId: "primary", socketId: primaryIdentity.socketId });
      await emit(harness, { hostId: "collision-b", socketId: collisionIdentity.socketId });
      expect(await primarySocket.next()).toMatchObject({ seq: 1 });
      expect(await collisionSocket.next()).toMatchObject({ seq: 1 });
      expect((await parityState(harness)).hosts.map((host) => host.replaySequence)).toEqual([1, 1]);
      const tape = loadCanonicalParityTape();
      const allInterests = tape.cases.find(
        (entry) => entry.id === "all-wire-variants-with-heavy-pr",
      )!.message;
      const emptyInterests = tape.cases.find((entry) => entry.id === "exact-empty-clear")!.message;
      primarySocket.ws.send(JSON.stringify(allInterests));
      collisionSocket.ws.send(JSON.stringify(emptyInterests));
      await flush(primarySocket.ws, "host-a-interest");
      await flush(collisionSocket.ws, "host-b-interest");
      const observedHosts = await parityState(harness);
      expect(
        observedHosts.hosts.find((host) => host.hostId === "primary")!.observations.messages,
      ).toHaveLength(1);
      expect(
        observedHosts.hosts.find((host) => host.hostId === "collision-b")!.observations.messages[0]!
          .cleared,
      ).toBe(true);

      await scenario(harness, { type: "reset" });
      await expect(
        emit(harness, { hostId: "primary", socketId: primaryIdentity.socketId }),
      ).rejects.toMatchObject({
        status: 409,
        code: "parity_socket_not_found",
      });
      const resetState = await parityState(harness);
      expect(resetState.hosts).toHaveLength(1);
      expect(resetState.hosts[0]!.observations.messages).toEqual([]);
      expect(harness.lab.observationLedger.listenerCount).toBe(0);

      await scenario(harness, { type: "seed-multihost-collision" });
      await parity(harness, { type: "reset" });
      const stale = await parity(harness, {
        type: "set-host-fault",
        hostId: "collision-b",
        fault: "stale-host",
      });
      expect(stale.status).toBe(200);
      const freshState = await parityState(harness);
      const freshCollision = freshState.hosts.find((host) => host.hostId === "collision-b")!;
      const freshAccess = await pairHost(freshCollision.httpBaseUrl, harness);
      const freshSocket = await openReadySocketAt(freshCollision.httpBaseUrl, freshAccess);
      const freshIdentity = (await parityState(harness)).hosts.find(
        (host) => host.hostId === "collision-b",
      )!.sockets[0]!;
      await expect(
        emit(harness, { hostId: "collision-b", socketId: freshIdentity.socketId }),
      ).rejects.toMatchObject({
        code: "parity_stale_host",
      });
      await parity(harness, { type: "clear-host-faults", hostId: "collision-b" });
      await emit(harness, { hostId: "collision-b", socketId: freshIdentity.socketId });
      expect(await freshSocket.next()).toMatchObject({ seq: 1 });
      primarySocket.ws.close();
      collisionSocket.ws.close();
      freshSocket.ws.close();
    } finally {
      await harness.stop();
    }
  });

  it("rejects idempotency conflicts and keeps parity output secret-free", async () => {
    const harness = await startLab();
    try {
      const invalid = await parity(harness, {
        type: "emit-tape-case",
        caseId: "unknown-case",
        socketId: "lc_access_not-a-socket",
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({
        error: { code: "invalid_parity_action", message: "Parity action is invalid." },
      });
      const first = await parity(harness, {
        type: "set-host-fault",
        fault: "apply-failure",
        requestId: "fault-once",
      });
      expect(first.status).toBe(200);
      const repeat = await parity(harness, {
        type: "set-host-fault",
        fault: "apply-failure",
        requestId: "fault-once",
      });
      expect(await repeat.json()).toEqual(await first.clone().json());
      const conflict = await parity(harness, {
        type: "set-host-fault",
        fault: "stale-host",
        requestId: "fault-once",
      });
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({
        error: { code: "parity_request_conflict", message: "Parity request ID conflict." },
      });
      const state = await parityState(harness);
      expect(collectSecretViolations(state)).toEqual([]);
      expect(collectSecretViolations(await first.clone().json())).toEqual([]);
      expect(JSON.stringify(state)).not.toMatch(/lc_(pair|access|ws)_/);
    } finally {
      await harness.stop();
    }
  });
});

async function parityState(harness: Awaited<ReturnType<typeof startLab>>): Promise<ParityState> {
  const response = await controlRequest(harness, "/v1/parity/state");
  expect(response.status).toBe(200);
  return (await response.json()) as ParityState;
}

async function parity(
  harness: Awaited<ReturnType<typeof startLab>>,
  action: Record<string, unknown>,
): Promise<Response> {
  return controlRequest(harness, "/v1/parity/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}

async function emit(
  harness: Awaited<ReturnType<typeof startLab>>,
  input: {
    readonly caseId?: string;
    readonly hostId?: string;
    readonly socketId: string;
    readonly sessionId?: string;
  },
): Promise<ParityActionResult> {
  const response = await parity(harness, {
    type: "emit-tape-case",
    ...input,
    caseId: input.caseId ?? "contiguous-one",
  });
  if (response.status !== 200) {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    throw Object.assign(new Error("Parity action failed."), {
      status: response.status,
      ...(body.error ?? {}),
    });
  }
  return (await response.json()) as ParityActionResult;
}

async function scenario(
  harness: Awaited<ReturnType<typeof startLab>>,
  action: Record<string, unknown>,
): Promise<{ state: unknown }> {
  const response = await controlRequest(harness, "/v1/scenario/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { state: unknown };
}

async function pairHost(
  httpBaseUrl: string,
  harness: Awaited<ReturnType<typeof startLab>>,
): Promise<string> {
  const response = await controlRequest(harness, "/v1/scenario/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "pairing-url",
      hostId: httpBaseUrl === harness.httpBaseUrl ? "primary" : "collision-b",
    }),
  });
  const body = (await response.json()) as { pairingUrl: string };
  const token = await exchangeToken(httpBaseUrl, pairingTokenFromUrl(body.pairingUrl), [
    "session:read",
  ]);
  expect(token.status).toBe(200);
  return token.accessToken;
}

async function openReadySocketAt(httpBaseUrl: string, accessToken: string) {
  const ticket = await issueTicket(httpBaseUrl, accessToken);
  expect(ticket.status).toBe(200);
  const host = new URL(httpBaseUrl);
  const socket = openBufferedSocket(`ws://${host.hostname}:${host.port}/`, ticket.ticket);
  await new Promise<void>((resolve, reject) => {
    socket.ws.once("open", () => resolve());
    socket.ws.once("error", reject);
  });
  return { ws: socket.ws, ready: await socket.next(), next: () => socket.next() };
}

async function flush(ws: import("ws").WebSocket, id: string): Promise<void> {
  ws.send(JSON.stringify({ type: "ping", id }));
  await readWsMessage(ws);
}
