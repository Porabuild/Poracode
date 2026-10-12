import { afterEach, describe, expect, it } from "vitest";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("ready, contiguous replay, gap, resync, regression", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("sends ready before any replayed events", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.publishEvent({ type: "thread-state", threadId: "thread-A", status: "idle" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "thread-B", status: "idle" });

    const { ready, next, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 0 });
    expect(ready).toEqual({ type: "ready", seq: 2 });
    expect(await next()).toMatchObject({ type: "event", seq: 1 });
    expect(await next()).toMatchObject({ type: "event", seq: 2 });
    ws.close();
  });

  it("replays a contiguous window and stays current at lastSeenSeq === seq", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.publishEvent({ type: "remote-threads-changed", threadIds: ["t1"] });
    const { ready, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 1 });
    expect(ready).toEqual({ type: "ready", seq: 1 });
    ws.close();
  });

  it("asks for resync when the replay window is missing", async () => {
    harness = await startLab({ replayLimit: 2 });
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.publishEvent({ type: "thread-state", threadId: "a" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "b" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "c" });
    const { ready, next, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 0 });
    expect(ready).toEqual({ type: "ready", seq: 3 });
    expect(await next()).toMatchObject({ type: "resync-required", seq: 3 });
    ws.close();
  });

  it("asks for resync on a sequence regression", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.publishEvent({ type: "thread-state", threadId: "a" });
    const { ready, next, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 99 });
    expect(ready).toEqual({ type: "ready", seq: 1 });
    expect(await next()).toMatchObject({
      type: "resync-required",
      reason: expect.stringMatching(/reset/i),
    });
    ws.close();
  });

  it("asks for resync when a published sequence is gapped", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.setFault({ kind: "sequence-gap" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "a" });
    harness.lab.publishEvent({ type: "thread-state", threadId: "b" });
    const { next, ws } = await openReadySocket(harness, accessToken, { lastSeenSeq: 0 });
    expect(await next()).toMatchObject({ type: "resync-required" });
    ws.close();
  });
});
