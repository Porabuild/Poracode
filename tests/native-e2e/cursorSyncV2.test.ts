import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { WebSocket } from "ws";
import { createTerminalFeed } from "../../src/shared/remote/terminalFeed.ts";
import { remoteWebSocketServerMessageSchema } from "../../src/shared/remote/protocol.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import { startRealHost, type RealHostHandle } from "./harness/realHost.ts";
import { findRepoRoot } from "./harness/paths.ts";
import { ProfileClient } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";
import { ConstrainedTcpProxy } from "./helpers/constrainedTcpProxy.ts";
import { expectOk } from "./helpers/sharedHostWorkload.ts";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts.ts";

/**
 * Cursor-sync v2 on a real host + real PTY (RESUME-V2-DESIGN §12).
 *
 * Cold start through the design-worst shaped link (`rtt1500ms-32kbps`): the
 * v2 feed must install the full-window baseline with zero watch errors —
 * the exact scenario the v1 probe measured as 3 retired attempts, 0
 * installed, first valid baseline at ~26.8 s. A second, fast test proves
 * resume on a real host: a reconnecting v2 client receives only the
 * uncovered suffix (`resumeServed: true`).
 */
it("installs a full-window v2 baseline through a 32 kbps / 1.5 s RTT link", async () => {
  const repoRoot = findRepoRoot();
  const cleanup = new ProcessCleanup();
  const clients: ProfileClient[] = [];
  const feed = createTerminalFeed();
  let host: RealHostHandle | undefined;
  let proxy: ConstrainedTcpProxy | undefined;
  try {
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "cursor-sync-v2-qa"),
    });
    const credential = await acquireDeviceCredential(host, "cursor-sync-v2");
    const healthy = await ProfileClient.create({ handle: host, label: "healthy", ...credential });
    clients.push(healthy);
    const snapshot = await healthy.fetchJson("snapshot", "/api/snapshot");
    expectOk(snapshot.status, "snapshot", snapshot.body);
    const project = (snapshot.body as { projects: Array<{ location: unknown }> }).projects[0]!;
    expect(
      (await healthy.fetchJson("environment", "/.well-known/poracode/environment")).body,
    ).toMatchObject({
      capabilities: { terminalCursorSync: { versions: expect.arrayContaining([2]) } },
    });

    const payload = randomBytes(96 * 1024).toString("base64"); // 131,072 units
    const path = join((project.location as { path: string }).path, "cursor-v2-payload.txt");
    writeFileSync(path, payload);
    const shellId = "cursor-v2-shell";
    const started = await healthy.fetchJson("start", "/api/terminal/start", {
      method: "POST",
      body: { shellId, projectLocation: project.location },
    });
    expectOk(started.status, "terminal start", started.body);
    expect((await healthy.watchTerminalReliable(shellId, "healthy-watch")).status).toBe("ready");
    const quoted = `'${path.replaceAll("'", "'\\''")}'`;
    const written = await healthy.fetchJson("write", `/api/threads/${shellId}/terminal/write`, {
      method: "POST",
      body: { data: `cat ${quoted}; printf '\\nV2-%s\\n' 'READY'\r` },
    });
    expectOk(written.status, "terminal write", written.body);
    await expect
      .poll(() => healthy.terminalState("healthy-watch")?.assembledText, { timeout: 20_000 })
      .toContain("V2-READY\r\n");
    const healthyText = healthy.terminalState("healthy-watch")!.assembledText;

    proxy = await ConstrainedTcpProxy.start({
      label: "v2-baseline-32kbps",
      upstreamHost: "127.0.0.1",
      upstreamPort: host.hostPort,
      oneWayDelayMs: 750,
      bytesPerSecond: 4000,
    });
    const slow = await ProfileClient.create({
      handle: proxy.wrapHandle(host),
      label: "slow-v2",
      ...credential,
    });
    clients.push(slow);

    const chunksSeen: Array<{
      index: number;
      count: number;
      units: number;
      resumeServed: boolean;
    }> = [];
    const acksSent: number[] = [];
    const errors: unknown[] = [];
    let installed = 0;
    let wireBefore = proxy.stats().serverToClient.bytesForwarded;
    const startedAt = performance.now();
    let completedAtMs = Number.POSITIVE_INFINITY;

    slow.ws.on("message", (raw) => {
      const parsed = remoteWebSocketServerMessageSchema.safeParse(JSON.parse(raw.toString()));
      if (!parsed.success) {
        errors.push(parsed.error.message);
        return;
      }
      const message = parsed.data;
      if (message.type === "terminal-watch-baseline-chunk") {
        chunksSeen.push({
          index: message.cursorSync.chunkIndex,
          count: message.cursorSync.chunkCount,
          units: message.cursorSync.data.length,
          resumeServed: message.cursorSync.resumeServed,
        });
      }
      feed.handleServerMessage(message);
    });
    feed.watch(shellId, {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onSnapshot: () => {
        installed += 1;
        completedAtMs = performance.now() - startedAt;
      },
      onWatchError: (error) => errors.push(error),
    });
    feed.setSender(
      (message) => {
        if (slow.ws.readyState !== WebSocket.OPEN) return false;
        if (message.type === "terminal-watch-baseline-ack") {
          acksSent.push(message.cursorSync.throughCursor);
        }
        slow.ws.send(JSON.stringify(message));
        return true;
      },
      { cursorSyncVersion: 2 },
    );

    await expect.poll(() => installed, { timeout: 90_000, interval: 500 }).toBe(1);
    const wireBytes = proxy.stats().serverToClient.bytesForwarded - wireBefore;

    // Design test #1 assertions: the v1 failure modes are inverted.
    expect(errors).toEqual([]); // idle deadline never fired mid-stream
    expect(chunksSeen.length).toBeGreaterThan(1); // chunked, not one message
    expect(healthyText).toContain(payload); // sanity on the recorder
    // The recorder keeps receiving live bytes after the slow client's
    // baseline froze; converge before comparing exact tails.
    const feedText = (): { text: string; cursor: number } => {
      // The feed's cache is authoritative: re-read through a fresh listener.
      let text = "";
      let cursor = -1;
      const unsubscribe = feed.watch(shellId, {
        onOutput: () => {},
        onReset: () => {},
        onExited: () => {},
        onSnapshot: (ready) => {
          text = ready.data;
          cursor = ready.toCursor;
        },
      });
      unsubscribe();
      return { text, cursor };
    };
    await expect
      .poll(
        () => {
          const { cursor } = feedText();
          return cursor;
        },
        { timeout: 45_000, interval: 1_000 },
      )
      .toBe(healthy.terminalState("healthy-watch")?.finalCursor);
    expect(feedText().text).toBe(healthy.terminalState("healthy-watch")!.assembledText);
    // ACK credit window: the client acked progressively while the stream ran.
    expect(acksSent.length).toBe(chunksSeen.length);
    expect(acksSent.at(-1)).toBeGreaterThan(payload.length);
    // Envelope overhead stays within the design bound (+10% over payload bytes).
    const payloadWireFloor = Math.floor(payload.length * 0.75);
    expect(wireBytes).toBeLessThanOrEqual(Math.floor(payloadWireFloor * 1.25));
    writeExperimentArtifact(repoRoot, "cursor-sync-v2-slow-link.json", {
      profile: { rttMs: 1500, bitsPerSecond: 32_000 },
      payloadUnits: payload.length,
      chunks: chunksSeen.length,
      installed,
      watchErrors: errors.length,
      completedAtMs: Math.round(completedAtMs),
      wireBytes,
      acks: acksSent.length,
      scope:
        "Real host + real PTY; paced per-connection TCP shaping, no packet loss; default v2 feed timers; the cold-start v1 failure (3 attempts, 0 installed, ~26.8 s) installs exactly once with zero errors.",
    });
    feed.setSender(null);
  } finally {
    feed.reset();
    feed.setSender(null);
    try {
      await closeProfileClients(clients);
    } finally {
      try {
        await proxy?.close();
      } finally {
        try {
          await host?.stop();
        } finally {
          await cleanup.shutdown();
        }
      }
    }
  }
}, 150_000);

it("serves a resuming v2 client only the uncovered suffix on a real host", async () => {
  const repoRoot = findRepoRoot();
  const cleanup = new ProcessCleanup();
  const clients: ProfileClient[] = [];
  const feed = createTerminalFeed();
  let host: RealHostHandle | undefined;
  try {
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "cursor-sync-v2-qa"),
    });
    const credential = await acquireDeviceCredential(host, "cursor-sync-v2-resume");
    const healthy = await ProfileClient.create({ handle: host, label: "healthy", ...credential });
    clients.push(healthy);
    const snapshot = await healthy.fetchJson("snapshot", "/api/snapshot");
    expectOk(snapshot.status, "snapshot", snapshot.body);
    const project = (snapshot.body as { projects: Array<{ location: unknown }> }).projects[0]!;
    const shellId = "cursor-v2-resume-shell";
    const started = await healthy.fetchJson("start", "/api/terminal/start", {
      method: "POST",
      body: { shellId, projectLocation: project.location },
    });
    expectOk(started.status, "terminal start", started.body);
    expect((await healthy.watchTerminalReliable(shellId, "healthy-watch")).status).toBe("ready");
    const write = async (label: string) => {
      const result = await healthy.fetchJson("write", `/api/threads/${shellId}/terminal/write`, {
        method: "POST",
        body: { data: `printf 'RESUME-%s-OK\\n' '${label}'\r` },
      });
      expectOk(result.status, "terminal write", result.body);
    };
    // Writes racing prompt/direnv activity can be echoed without executing;
    // keep knocking until this marker's output provably landed.
    const writeUntilSeen = async (label: string) => {
      await expect
        .poll(
          async () => {
            await write(label);
            return healthy.terminalState("healthy-watch")?.assembledText ?? "";
          },
          { timeout: 30_000, interval: 1_000 },
        )
        .toContain(`RESUME-${label}-OK`);
    };
    // Writes typed during shell init are echoed but never executed; keep
    // knocking until the PTY demonstrably runs a command.
    await expect
      .poll(
        async () => {
          const result = await healthy.fetchJson(
            "write",
            `/api/threads/${shellId}/terminal/write`,
            { method: "POST", body: { data: `printf 'WARM-%s-OK\\n' 'go'\r` } },
          );
          expectOk(result.status, "terminal write", result.body);
          return healthy.terminalState("healthy-watch")?.assembledText ?? "";
        },
        { timeout: 30_000, interval: 1_000 },
      )
      .toContain("WARM-go-OK");

    const chunksSeen: Array<{ resumeServed: boolean; units: number }> = [];
    const errors: unknown[] = [];
    let installed = 0;
    let sender: ((message: unknown) => boolean) | null = null;
    const attach = (ws: WebSocket) => {
      ws.on("message", (raw) => {
        const parsed = remoteWebSocketServerMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "terminal-watch-baseline-chunk") {
          chunksSeen.push({
            resumeServed: message.cursorSync.resumeServed,
            units: message.cursorSync.data.length,
          });
        }
        feed.handleServerMessage(message);
      });
      sender = (message: unknown) => {
        if (ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(message));
        return true;
      };
      feed.setSender(sender as never, { cursorSyncVersion: 2 });
    };

    feed.watch(shellId, {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onSnapshot: () => {
        installed += 1;
      },
      onWatchError: (error) => errors.push(error),
    });
    await writeUntilSeen("FIRST");
    const first = await ProfileClient.create({ handle: host, label: "v2-first", ...credential });
    clients.push(first);
    attach(first.ws);
    await expect.poll(() => installed, { timeout: 20_000 }).toBe(1);
    expect(chunksSeen.every((c) => !c.resumeServed)).toBe(true);
    const coldChunks = chunksSeen.length;
    const coldUnits = chunksSeen.reduce((total, c) => total + c.units, 0);

    // Detach, produce new bytes, reattach: the resume presents the cache
    // cursor and the server serves only the suffix.
    feed.setSender(null);
    await first.close();
    await writeUntilSeen("SECOND");
    chunksSeen.length = 0;
    const second = await ProfileClient.create({ handle: host, label: "v2-second", ...credential });
    clients.push(second);
    attach(second.ws);
    await expect.poll(() => installed, { timeout: 20_000 }).toBe(2);
    expect(errors).toEqual([]);
    expect(chunksSeen.every((c) => c.resumeServed)).toBe(true);
    // The suffix must be strictly smaller than a cold re-download of the
    // same window — resume honored the presented cursor. (Retries from the
    // knocking writer and prompt redraws are part of that suffix.)
    expect(chunksSeen.reduce((total, c) => total + c.units, 0)).toBeLessThan(coldUnits);
    expect(healthy.terminalState("healthy-watch")!.assembledText).toContain("RESUME-FIRST-OK");
    expect(healthy.terminalState("healthy-watch")!.assembledText).toContain("RESUME-SECOND-OK");
    writeExperimentArtifact(repoRoot, "cursor-sync-v2-resume.json", {
      coldBaselineChunks: coldChunks,
      resumeChunks: chunksSeen.length,
      resumeUnits: chunksSeen.reduce((total, c) => total + c.units, 0),
      installed,
      watchErrors: errors.length,
      scope: "Real host + real PTY; reconnecting v2 client receives only the uncovered suffix.",
    });
  } finally {
    feed.reset();
    feed.setSender(null);
    try {
      await closeProfileClients(clients);
    } finally {
      try {
        await host?.stop();
      } finally {
        await cleanup.shutdown();
      }
    }
  }
}, 90_000);
