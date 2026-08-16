import { afterEach, describe, expect, it } from "vitest";
import { loadScriptJournal } from "./harness/durableScripts.ts";
import {
  cleanupRunDirectory,
  createRunDirectory,
  isValidatedRunDirectory,
} from "./harness/runDirectory.ts";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("durable checkpoint/fault scripts and restart", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;
  const runDirs: string[] = [];

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
    for (const path of runDirs) {
      if (isValidatedRunDirectory(path)) cleanupRunDirectory(path, { keep: false });
    }
    runDirs.length = 0;
  });

  it("replays journaled checkpoints after a same-port restart", async () => {
    const run = createRunDirectory();
    runDirs.push(run.path);
    harness = await startLab({ journalPath: run.journalPath });
    const port = harness.hostPort;
    harness.lab.applyCheckpoint("seed-replay-two-events");
    expect(harness.lab.ring.seq).toBe(2);
    const journal = loadScriptJournal(run.journalPath);
    expect(
      journal.entries.map((entry) => `${entry.kind}:${"id" in entry ? entry.id : ""}`),
    ).toEqual(["checkpoint:seed-replay-two-events"]);

    await harness.lab.restart();
    expect(harness.hostPort).toBe(port);
    expect(harness.lab.ring.seq).toBe(2);

    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const { ready, next, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 0 });
    expect(ready).toEqual({ type: "ready", seq: 2 });
    expect(await next()).toMatchObject({ type: "event", seq: 1 });
    expect(await next()).toMatchObject({ type: "event", seq: 2 });
    ws.close();
  });

  it("restores a journaled sequence-gap fault so resume still requests resync", async () => {
    const run = createRunDirectory();
    runDirs.push(run.path);
    harness = await startLab({ journalPath: run.journalPath });
    harness.lab.activateFaultFixture("sequence-gap");
    await harness.lab.restart();
    harness.lab.publishEvent({ type: "thread-state", threadId: "after-restart" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "after-restart-2" });
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const { next, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 0 });
    expect(await next()).toMatchObject({ type: "resync-required" });
    ws.close();
  });
});
