import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { ProfileClient, type ReceivedEvent } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";
import {
  expectOk,
  quiesceAndAssertConvergence,
  renameProjectAndAwaitFanout,
  type WorkloadProject,
} from "./helpers/sharedHostWorkload.ts";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts.ts";

/**
 * WS9 evidence-gap item "fault-injected web reconnect", proven against the
 * real production host (`dist/main/server.cjs`): a web/mobile event-stream
 * client must lose nothing when its socket dies mid-stream.
 *
 * Three fault scenarios, all through the real API surface (bearer sessions,
 * one-use WS tickets, the production replay pump in `eventReplay.ts`):
 *
 *  1. Abrupt TCP reset (RST, not a clean close) while a second client keeps
 *     mutating. Reconnect with the pre-fault `lastSeenSeq` must replay
 *     EXACTLY the missed window — same seqs, identical event bodies — with no
 *     gaps and no `resync-required`.
 *  2. Reconnect racing an active mutation burst: whether each missed event
 *     arrives via replay or live fan-out is a race; the invariant (every
 *     mutation observed, contiguous seqs, cross-client body equality) must
 *     hold regardless of the race outcome.
 *  3. Host restart: `ctx.seq` is in-memory, so the reconnecting client's
 *     cursor is above the fresh stream's. The server must force
 *     `resync-required` ("Server event stream reset") instead of letting the
 *     client keep stale state, and a snapshot rebuild must converge with the
 *     durable pre-restart state intact.
 *
 * Assertions are functional invariants only; evidence lands in
 * tmp/v2-production-review/shared-host/.
 */

const SEED_PROJECT_NAME = "native-e2e-fixture";

describe("fault-injected web reconnect (real host)", () => {
  const repoRoot = findRepoRoot();
  let cleanup: ProcessCleanup | undefined;
  let host: RealHostHandle | undefined;
  const clients: ProfileClient[] = [];

  afterEach(async () => {
    await closeProfileClients(clients);
    clients.length = 0;
    await host?.stop();
    host = undefined;
    await cleanup?.shutdown("test-end");
    cleanup = undefined;
  });

  async function startHost(owner: ProcessCleanup): Promise<RealHostHandle> {
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup: owner,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "web-reconnect-qa"),
    });
    return host;
  }

  /** Discovers the seeded fixture project before any rename changes its name. */
  async function discoverProject(client: ProfileClient): Promise<WorkloadProject> {
    const snapshot = await client.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(snapshot.status, "snapshot read", snapshot.body);
    const projects =
      (snapshot.body as { projects?: Array<Record<string, unknown>> }).projects ?? [];
    const seeded = projects.find((entry) => entry.name === SEED_PROJECT_NAME);
    assert(seeded, `seeded project ${SEED_PROJECT_NAME} must exist`);
    const location = seeded.location as { kind?: string; path?: string } | undefined;
    assert.strictEqual(location?.kind, "posix", "seeded project must be a posix location");
    return { projectId: String(seeded.id), locationPath: String(location?.path) };
  }

  /** Rename mutation without waiting for any stream fan-out. */
  async function renameProject(
    client: ProfileClient,
    project: WorkloadProject,
    name: string,
  ): Promise<void> {
    const response = await client.fetchJson("project-update", "/api/projects/command", {
      method: "POST",
      body: { kind: "update", projectId: project.projectId, patch: { name } },
    });
    expectOk(response.status, `project rename to ${name}`, response.body);
  }

  /** Abrupt network-style socket death: a genuine TCP RST via
   * `resetAndDestroy()`, never a clean WS close handshake. */
  async function killSocket(client: ProfileClient): Promise<void> {
    const raw = (
      client.ws as unknown as {
        _socket?: { resetAndDestroy?: () => void } | null;
      }
    )._socket;
    if (raw && typeof raw.resetAndDestroy === "function") {
      raw.resetAndDestroy();
    } else {
      client.ws.terminate();
    }
    await client.close();
  }

  /** name → { seq, event } for every projects-changed event carrying a
   * rename of `projectId` to one of `names`. Fails on duplicate delivery. */
  function renameObservations(
    client: ProfileClient,
    projectId: string,
    names: readonly string[],
  ): Map<string, { seq: number; event: Record<string, unknown> }> {
    const byName = new Map<string, { seq: number; event: Record<string, unknown> }>();
    for (const received of client.receivedEvents()) {
      if (received.type !== "remote-projects-changed") continue;
      const projects =
        (received.event.projects as Array<{ id?: string; name?: string }> | undefined) ?? [];
      for (const entry of projects) {
        if (entry?.id !== projectId || typeof entry.name !== "string") continue;
        if (!names.includes(entry.name)) continue;
        const existing = byName.get(entry.name);
        assert(
          !existing,
          `${client.label}: rename to ${entry.name} observed twice (seq ${String(existing?.seq)} and ${String(received.seq)})`,
        );
        byName.set(entry.name, { seq: received.seq, event: received.event });
      }
    }
    return byName;
  }

  /** Cross-client proof that the resumed stream delivered identical
   * rename events at the same seqs the witness observed live. */
  function assertRenameParity(
    witness: ProfileClient,
    resumed: ProfileClient,
    projectId: string,
    names: readonly string[],
  ): void {
    const witnessed = renameObservations(witness, projectId, names);
    const resumedObservations = renameObservations(resumed, projectId, names);
    for (const name of names) {
      const fromWitness = witnessed.get(name);
      const fromResumed = resumedObservations.get(name);
      assert(fromWitness, `witness never observed rename to ${name}`);
      assert(fromResumed, `resumed client never observed rename to ${name}`);
      assert.strictEqual(
        fromResumed.seq,
        fromWitness.seq,
        `rename to ${name} must arrive at the same seq on both clients`,
      );
      assert.deepStrictEqual(
        fromResumed.event,
        fromWitness.event,
        `rename to ${name} must carry an identical event body on both clients`,
      );
    }
  }

  it("replays exactly the missed window after an abrupt mid-stream socket reset", async () => {
    const owner = new ProcessCleanup();
    cleanup = owner;
    const handle = await startHost(owner);
    const credential = await acquireDeviceCredential(handle, "recon-reset");
    const victim = await ProfileClient.create({
      handle,
      label: "recon-reset-victim",
      accessToken: credential.accessToken,
    });
    const witness = await ProfileClient.create({
      handle,
      label: "recon-reset-witness",
      accessToken: credential.accessToken,
    });
    clients.push(victim, witness);
    const project = await discoverProject(witness);

    // Baseline: both clients demonstrably stream live events.
    const runTag = `webrecon-reset-${Date.now()}`;
    const baselineName = `${runTag}-baseline`;
    await renameProjectAndAwaitFanout(witness, [victim, witness], project, baselineName);
    const lastSeenSeq = victim.metrics.lastEventSeq;
    assert(typeof lastSeenSeq === "number", "victim must have observed events before the fault");

    // Injected fault: TCP reset while the victim is live.
    await killSocket(victim);

    // Missed mutations while the victim is offline.
    const missedNames = Array.from(
      { length: 6 },
      (_, index) => `${runTag}-missed-${String(index + 1).padStart(2, "0")}`,
    );
    for (const name of missedNames) {
      await renameProjectAndAwaitFanout(witness, [witness], project, name);
    }

    // Reconnect with the pre-fault cursor.
    const resumed = await ProfileClient.create({
      handle,
      label: "recon-reset-resumed",
      accessToken: credential.accessToken,
      lastSeenSeq,
    });
    clients.push(resumed);
    for (const name of missedNames) {
      const event = await resumed.awaitNextEvent(
        (received: ReceivedEvent) =>
          received.type === "remote-projects-changed" &&
          JSON.stringify(received.event).includes(name),
      );
      assert(event.seq > lastSeenSeq, `replayed rename to ${name} must be past the cursor`);
    }

    // The replay resumed exactly at the first missed event and stayed
    // contiguous. Nothing but the missed renames publishes in the window, so
    // both the ready cursor and the replay count are exactly determined.
    expect(resumed.metrics.firstEventSeq).toBe(lastSeenSeq + 1);
    expect(resumed.metrics.readySeq).toBe(lastSeenSeq + missedNames.length);
    expect(resumed.metrics.replayedEventCount).toBe(missedNames.length);
    expect(resumed.metrics.eventSeqGaps).toBe(0);
    expect(resumed.metrics.resyncRequiredCount).toBe(0);
    assertRenameParity(witness, resumed, project.projectId, missedNames);

    // The resumed client is a fully live participant again.
    const liveName = `${runTag}-live-after-resume`;
    await renameProjectAndAwaitFanout(resumed, [resumed, witness], project, liveName);
    const snapshotSeq = await quiesceAndAssertConvergence([resumed, witness], "recon-reset");
    assertRenameParity(witness, resumed, project.projectId, [liveName]);

    writeExperimentArtifact(repoRoot, "web-reconnect-midstream-replay.json", {
      scenario: "abrupt TCP reset mid-stream, reconnect with pre-fault lastSeenSeq",
      victimLastSeenSeqAtFault: lastSeenSeq,
      resumedFirstEventSeq: resumed.metrics.firstEventSeq,
      missedRenames: missedNames,
      resumedMetrics: {
        readySeq: resumed.metrics.readySeq,
        firstEventSeq: resumed.metrics.firstEventSeq,
        lastEventSeq: resumed.metrics.lastEventSeq,
        eventSeqGaps: resumed.metrics.eventSeqGaps,
        resyncRequiredCount: resumed.metrics.resyncRequiredCount,
        replayedEventCount: resumed.metrics.replayedEventCount,
      },
      witnessMetrics: {
        lastEventSeq: witness.metrics.lastEventSeq,
        eventSeqGaps: witness.metrics.eventSeqGaps,
      },
      convergedSnapshotSeq: snapshotSeq,
      scope:
        "Real headless host, real pairing/bearer/ticket surface, fixture project renames as " +
        "broadcast events. The victim socket was terminated (RST) mid-stream; the reconnected " +
        "client replayed exactly the missed window (firstEventSeq = lastSeenSeq+1) with " +
        "identical event bodies at identical seqs and zero gaps, then converged with the " +
        "never-disconnected witness.",
    });
  }, 120_000);

  it("loses nothing when the reconnect races an active mutation burst", async () => {
    const owner = new ProcessCleanup();
    cleanup = owner;
    const handle = await startHost(owner);
    const credential = await acquireDeviceCredential(handle, "recon-race");
    const victim = await ProfileClient.create({
      handle,
      label: "recon-race-victim",
      accessToken: credential.accessToken,
    });
    const witness = await ProfileClient.create({
      handle,
      label: "recon-race-witness",
      accessToken: credential.accessToken,
    });
    clients.push(victim, witness);
    const project = await discoverProject(witness);

    const runTag = `webrecon-race-${Date.now()}`;
    await renameProjectAndAwaitFanout(witness, [victim, witness], project, `${runTag}-baseline`);
    const lastSeenSeq = victim.metrics.lastEventSeq;
    assert(typeof lastSeenSeq === "number", "victim must have observed events before the fault");

    await killSocket(victim);

    // The burst keeps mutating while the victim reconnects; whether each event
    // arrives via replay or live fan-out is the race under test.
    const burstNames = Array.from(
      { length: 12 },
      (_, index) => `${runTag}-burst-${String(index + 1).padStart(2, "0")}`,
    );
    let burstError: unknown;
    const burst = (async () => {
      for (const name of burstNames) await renameProject(witness, project, name);
    })().catch((error: unknown) => {
      burstError = error;
    });
    const resumed = await ProfileClient.create({
      handle,
      label: "recon-race-resumed",
      accessToken: credential.accessToken,
      lastSeenSeq,
    });
    clients.push(resumed);
    await burst;
    if (burstError !== undefined) throw burstError;

    for (const name of burstNames) {
      const event = await resumed.awaitNextEvent(
        (received: ReceivedEvent) =>
          received.type === "remote-projects-changed" &&
          JSON.stringify(received.event).includes(name),
      );
      assert(event.seq > lastSeenSeq, `rename to ${name} must be past the cursor`);
    }
    // Holds in every race outcome: the replay branch starts at cursor+1 and
    // the live branch's first publish after the cursor is cursor+1.
    expect(resumed.metrics.firstEventSeq).toBe(lastSeenSeq + 1);
    expect(resumed.metrics.eventSeqGaps).toBe(0);
    expect(resumed.metrics.resyncRequiredCount).toBe(0);
    assertRenameParity(witness, resumed, project.projectId, burstNames);

    const snapshotSeq = await quiesceAndAssertConvergence([resumed, witness], "recon-race");
    writeExperimentArtifact(repoRoot, "web-reconnect-racing-burst.json", {
      scenario: "reconnect racing an active mutation burst (replay/live race)",
      victimLastSeenSeqAtFault: lastSeenSeq,
      burstRenames: burstNames.length,
      resumedMetrics: {
        readySeq: resumed.metrics.readySeq,
        firstEventSeq: resumed.metrics.firstEventSeq,
        lastEventSeq: resumed.metrics.lastEventSeq,
        eventSeqGaps: resumed.metrics.eventSeqGaps,
        resyncRequiredCount: resumed.metrics.resyncRequiredCount,
        replayedEventCount: resumed.metrics.replayedEventCount,
      },
      witnessMetrics: {
        lastEventSeq: witness.metrics.lastEventSeq,
        eventSeqGaps: witness.metrics.eventSeqGaps,
      },
      convergedSnapshotSeq: snapshotSeq,
      scope:
        "Real headless host. The victim socket was terminated and reconnected WHILE the " +
        "witness kept renaming the project; the race outcome (replay vs live delivery) is " +
        "not fixed by the test. Every burst mutation arrived exactly once, contiguously, " +
        "with cross-client body equality, and both clients converged on the host cursor.",
    });
  }, 120_000);

  it("forces resync-required after a host restart and converges from a fresh snapshot", async () => {
    const owner = new ProcessCleanup();
    cleanup = owner;
    const handle = await startHost(owner);
    const credential = await acquireDeviceCredential(handle, "recon-restart");
    const victim = await ProfileClient.create({
      handle,
      label: "recon-restart-victim",
      accessToken: credential.accessToken,
    });
    clients.push(victim);
    const project = await discoverProject(victim);

    // Build a cursor comfortably above anything the restarted host can reach
    // before this client reconnects.
    const runTag = `webrecon-restart-${Date.now()}`;
    const preRestartNames = Array.from(
      { length: 3 },
      (_, index) => `${runTag}-pre-${String(index + 1)}`,
    );
    for (const name of preRestartNames) {
      await renameProjectAndAwaitFanout(victim, [victim], project, name);
    }
    const staleSeq = victim.metrics.lastEventSeq;
    assert(typeof staleSeq === "number" && staleSeq > 0, "victim must hold a real cursor");
    const durableName = preRestartNames[preRestartNames.length - 1]!;

    // Injected fault: the server process dies and comes back. `ctx.seq` is
    // in-memory, so the fresh stream starts below the client's cursor while
    // bearer sessions survive.
    await handle.restart();
    await victim.close();

    const revived = await ProfileClient.create({
      handle,
      label: "recon-restart-revived",
      accessToken: credential.accessToken,
      lastSeenSeq: staleSeq,
    });
    clients.push(revived);
    assert(
      typeof revived.metrics.readySeq === "number" && revived.metrics.readySeq < staleSeq,
      `restarted host cursor (${String(revived.metrics.readySeq)}) must sit below the stale client cursor (${String(staleSeq)})`,
    );

    // The server must force a rebuild instead of serving a stale delta.
    const resyncDeadline = performance.now() + 5_000;
    for (;;) {
      if (revived.metrics.resyncRequiredCount >= 1) break;
      if (performance.now() > resyncDeadline) {
        throw new Error("revived client never received resync-required after the stream reset");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(revived.metrics.eventSeqGaps).toBe(0);

    // Client rebuild path: authoritative snapshot first — and the pre-restart
    // rename must have survived the restart durably.
    const snapshot = await revived.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(snapshot.status, "post-restart snapshot", snapshot.body);
    const projects =
      (snapshot.body as { projects?: Array<{ id?: string; name?: string }> }).projects ?? [];
    const persisted = projects.find((entry) => entry.id === project.projectId);
    assert(persisted, "fixture project must survive the restart");
    assert.strictEqual(
      persisted?.name,
      durableName,
      "the last pre-restart rename must be durable across the host restart",
    );

    // Live streaming works in the new stream life, and the stream converges
    // on the new authoritative cursor.
    const postRestartName = `${runTag}-post`;
    await renameProjectAndAwaitFanout(revived, [revived], project, postRestartName);
    const after = await revived.fetchJson("snapshot-read", "/api/snapshot");
    expectOk(after.status, "post-rename snapshot", after.body);
    expect((after.body as { snapshotSeq?: number }).snapshotSeq).toBe(revived.metrics.lastEventSeq);
    expect(revived.metrics.eventSeqGaps).toBe(0);

    writeExperimentArtifact(repoRoot, "web-reconnect-host-restart-resync.json", {
      scenario: "host restart mid-connection; client reconnects with a stale cursor",
      staleCursor: staleSeq,
      restartedReadySeq: revived.metrics.readySeq,
      resyncRequiredCount: revived.metrics.resyncRequiredCount,
      durableRenameSurvivedRestart: persisted?.name === durableName,
      postRestartRenameSeq: revived.metrics.lastEventSeq,
      revivedMetrics: {
        readySeq: revived.metrics.readySeq,
        lastEventSeq: revived.metrics.lastEventSeq,
        eventSeqGaps: revived.metrics.eventSeqGaps,
      },
      scope:
        "Real headless host, restarted through the harness (owned child process). The " +
        "in-memory event stream resets while bearer sessions persist, so the reconnecting " +
        "client's cursor is above the fresh stream: the server must answer with " +
        "resync-required rather than a delta. A fresh authoritative snapshot was then " +
        "served with the pre-restart rename still durable, and live streaming converged " +
        "on the new cursor.",
    });
  }, 120_000);
});
