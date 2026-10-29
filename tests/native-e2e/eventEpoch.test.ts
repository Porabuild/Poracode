import { afterEach, describe, expect, it } from "vitest";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("event-stream epoch mirror (eventEpoch=v1)", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("reports the epoch only to declaring sockets", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const legacy = await openReadySocket(harness, accessToken);
    expect(legacy.ready).toEqual({ type: "ready", seq: 0 });
    legacy.ws.close();
    const declared = await openReadySocket(harness, accessToken, { eventEpoch: true });
    expect(declared.ready).toEqual({ type: "ready", seq: 0, epoch: expect.any(String) });
    declared.ws.close();
  });

  it("refuses a cursor bound to the epoch before a sequence regression", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const live = await openReadySocket(harness, accessToken, { eventEpoch: true });
    const { epoch: before } = live.ready as { epoch: string };
    live.ws.close();
    harness.lab.publishEvent({ type: "thread-state", threadId: "a" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "b" });
    harness.lab.setFault({ kind: "sequence-regression" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "c" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "d" });

    const stale = await openReadySocket(harness, accessToken, {
      lastSeenSeq: 1,
      eventEpoch: before,
    });
    const { epoch: after } = stale.ready as { epoch: string };
    expect(after).not.toBe(before);
    expect(await stale.next()).toMatchObject({ type: "resync-required" });
    stale.ws.close();

    const current = await openReadySocket(harness, accessToken, {
      lastSeenSeq: 1,
      eventEpoch: after,
    });
    expect(await current.next()).toMatchObject({ type: "event", seq: 2 });
    current.ws.close();
  });

  it("refuses an undeclared session's first positive resume once, then replays", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.publishEvent({ type: "thread-state", threadId: "a" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "b" });
    const first = await openReadySocket(harness, accessToken, { lastSeenSeq: 1 });
    expect(first.ready).toEqual({ type: "ready", seq: 2 });
    expect(await first.next()).toMatchObject({ type: "resync-required", seq: 2 });
    first.ws.close();
    const again = await openReadySocket(harness, accessToken, { lastSeenSeq: 1 });
    expect(await again.next()).toMatchObject({ type: "event", seq: 2 });
    again.ws.close();
  });
});
