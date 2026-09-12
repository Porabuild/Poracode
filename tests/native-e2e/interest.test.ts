import { afterEach, describe, expect, it } from "vitest";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";
import { buildRuntimeEvent } from "./harness/labFixtures.ts";

describe("thread-item interest flush", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("delivers content for watched threads and empties others without dropping seq", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const { ws, next } = await openReadySocket(harness, accessToken, {
      threadItemInterests: ["thread-A"],
    });

    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: "thread-A",
      event: { ...buildRuntimeEvent("content.delta", "thread-A"), delta: "kept" },
    });
    expect(await next()).toMatchObject({
      type: "event",
      seq: 1,
      event: {
        type: "thread-runtime-event",
        threadId: "thread-A",
        event: { type: "content.delta" },
      },
    });

    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: "thread-B",
      event: { ...buildRuntimeEvent("content.delta", "thread-B"), delta: "hidden" },
    });
    expect(await next()).toEqual({
      type: "event",
      seq: 2,
      event: { type: "thread-runtime-events", threadId: "thread-B", events: [] },
    });

    ws.send(JSON.stringify({ type: "thread-item-interests", threadIds: ["thread-B"] }));
    ws.send(JSON.stringify({ type: "ping", id: "interest-flush" }));
    expect(await next()).toMatchObject({ type: "pong", id: "interest-flush" });
    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: "thread-B",
      event: {
        ...buildRuntimeEvent("content.delta", "thread-B"),
        delta: "now-visible",
      },
    });
    expect(await next()).toMatchObject({
      type: "event",
      seq: 3,
      event: { type: "thread-runtime-event", threadId: "thread-B" },
    });
    ws.close();
  });

  it("applies the interest-race fixture so replay is not filtered until interests attach", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    harness.lab.publishEvent({
      type: "thread-runtime-event",
      threadId: "thread-A",
      event: { ...buildRuntimeEvent("content.delta", "thread-A"), delta: "early" },
    });
    harness.lab.setFault({ kind: "interest-race" });
    const { ws, next } = await openReadySocket(harness, accessToken, {
      lastSeenSeq: 0,
      threadItemInterests: ["thread-B"],
    });
    expect(await next()).toMatchObject({
      type: "event",
      event: { type: "thread-runtime-event", threadId: "thread-A" },
    });
    ws.close();
  });
});
