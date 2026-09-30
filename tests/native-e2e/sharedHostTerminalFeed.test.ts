import { join } from "node:path";
import { WebSocket } from "ws";
import { expect, it } from "vitest";
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
import { expectOk } from "./helpers/sharedHostWorkload.ts";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts.ts";

/** Use the actual browser feed against production HTTP/WS and a real PTY.
 * A second, continuously connected client independently records the tail. */
it("restores a disconnected browser feed without replaying history as live output", async () => {
  const repoRoot = findRepoRoot();
  const cleanup = new ProcessCleanup();
  const clients: ProfileClient[] = [];
  const feed = createTerminalFeed();
  let host: RealHostHandle | undefined;
  try {
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "terminal-feed-qa"),
    });
    const credential = await acquireDeviceCredential(host, "terminal-feed");
    const connect = async (label: string) => {
      const client = await ProfileClient.create({ handle: host!, label, ...credential });
      clients.push(client);
      return client;
    };
    const healthy = await connect("healthy-observer");
    const environment = await healthy.fetchJson("environment", "/.well-known/poracode/environment");
    expectOk(environment.status, "environment", environment.body);
    expect(environment.body).toMatchObject({
      capabilities: { terminalCursorSync: { versions: expect.arrayContaining([1]) } },
    });
    const snapshot = await healthy.fetchJson("snapshot", "/api/snapshot");
    expectOk(snapshot.status, "snapshot", snapshot.body);
    const project = (snapshot.body as { projects: Array<{ location: unknown }> }).projects[0]!;
    const shellId = "browser-feed-shell";
    const started = await healthy.fetchJson("start", "/api/terminal/start", {
      method: "POST",
      body: { shellId, projectLocation: project.location },
    });
    expectOk(started.status, "terminal start", started.body);
    expect((await healthy.watchTerminalReliable(shellId, "observer-watch")).status).toBe("ready");

    let displayed = "";
    let cursor = 0;
    let snapshotCount = 0;
    const liveOutput: string[] = [];
    const errors: unknown[] = [];
    const watchIds: string[] = [];
    feed.watch(shellId, {
      onOutput: (data) => {
        displayed += data;
        cursor += data.length;
        liveOutput.push(data);
      },
      onSnapshot: (ready) => {
        displayed = ready.data;
        cursor = ready.toCursor;
        snapshotCount++;
      },
      onReset: () => {
        displayed = "";
        cursor = 0;
      },
      onExited: () => undefined,
      onWatchError: (error) => errors.push(error),
    });
    const attach = (client: ProfileClient) => {
      client.ws.on("message", (raw) => {
        const parsed = remoteWebSocketServerMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) {
          errors.push(parsed.error.message);
          return;
        }
        feed.handleServerMessage(parsed.data);
      });
      feed.setSender(
        (message) => {
          if (client.ws.readyState !== WebSocket.OPEN) return false;
          if (message.type === "terminal-watch" && message.cursorSync) {
            watchIds.push(message.cursorSync.watchId);
          }
          client.ws.send(JSON.stringify(message));
          return true;
        },
        { cursorSyncVersion: 1 },
      );
    };
    const writeMarker = async (label: string) => {
      const result = await healthy.fetchJson("write", `/api/threads/${shellId}/terminal/write`, {
        method: "POST",
        body: { data: `printf 'FEED-%s-日本語-✓\\n' '${label}'\r` },
      });
      expectOk(result.status, "terminal write", result.body);
      await expect
        .poll(() => healthy.terminalState("observer-watch")?.assembledText, { timeout: 20_000 })
        .toContain(`FEED-${label}-日本語-✓`);
    };

    const first = await connect("browser-feed-first");
    attach(first);
    await expect.poll(() => snapshotCount).toBe(1);
    await writeMarker("ONLINE");
    await expect.poll(() => displayed).toContain("FEED-ONLINE-日本語-✓");
    feed.setSender(null);
    await first.close();
    await writeMarker("OFFLINE");
    expect(displayed).not.toContain("FEED-OFFLINE-日本語-✓");
    liveOutput.length = 0;
    const recovered = await connect("browser-feed-recovered");
    attach(recovered);
    await expect.poll(() => snapshotCount).toBe(2);
    expect(displayed).toContain("FEED-OFFLINE-日本語-✓");
    expect(liveOutput.join("")).not.toContain("FEED-OFFLINE-日本語-✓");
    await writeMarker("AFTER");
    await expect.poll(() => displayed).toContain("FEED-AFTER-日本語-✓");
    await expect.poll(() => cursor).toBe(healthy.terminalState("observer-watch")?.finalCursor);
    expect(displayed).toBe(healthy.terminalState("observer-watch")?.assembledText);
    expect(errors).toEqual([]);
    expect(new Set(watchIds).size).toBe(2);
    expect(healthy.ws.readyState).toBe(WebSocket.OPEN);
    writeExperimentArtifact(repoRoot, "browser-terminal-feed.json", {
      snapshots: snapshotCount,
      distinctWatchIds: new Set(watchIds).size,
      finalCursor: cursor,
      healthyCursor: healthy.terminalState("observer-watch")?.finalCursor,
      exactTailMatch: true,
      historyNotDeliveredAsLive: true,
      scope:
        "Real shared backend/PTY and production browser feed; one explicit disconnect/reconnect. Bounded retained tail, not arbitrary network impairment or unlimited history.",
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
