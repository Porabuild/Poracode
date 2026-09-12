import { afterEach, describe, expect, it } from "vitest";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("replay truncation", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("asks for resync when lastSeenSeq falls out of a truncated ring", async () => {
    harness = await startLab({ replayLimit: 2 });
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    for (const threadId of ["a", "b", "c", "d"]) {
      harness.lab.publishEvent({ type: "thread-state", threadId });
    }
    expect(harness.lab.ring.size).toBe(2);
    expect(harness.lab.ring.oldestSeq).toBe(3);
    expect(harness.lab.ring.seq).toBe(4);

    const stale = await openReadySocket(harness, accessToken, { lastSeenSeq: 1 });
    expect(stale.ready).toEqual({ type: "ready", seq: 4 });
    expect(await stale.next()).toMatchObject({
      type: "resync-required",
      seq: 4,
      reason: expect.stringMatching(/expired|window/i),
    });
    stale.ws.close();

    const current = await openReadySocket(harness, accessToken, { lastSeenSeq: 2 });
    expect(current.ready).toEqual({ type: "ready", seq: 4 });
    expect(await current.next()).toMatchObject({ type: "event", seq: 3 });
    expect(await current.next()).toMatchObject({ type: "event", seq: 4 });
    current.ws.close();
  });
});
