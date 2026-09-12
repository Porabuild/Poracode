import { afterEach, describe, expect, it } from "vitest";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("event delivery once vs injected duplicate", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("delivers a published event exactly once", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const { ws, next } = await openReadySocket(harness, accessToken);
    harness.lab.publishEvent({ type: "thread-state", threadId: "once", status: "idle" });
    expect(await next()).toMatchObject({ type: "event", seq: 1 });
    ws.send(JSON.stringify({ type: "ping", id: "after-once" }));
    expect(await next()).toMatchObject({ type: "pong", id: "after-once" });
    ws.close();
  });

  it("delivers twice only when the named duplicate-event-delivery fixture is active", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const { ws, next } = await openReadySocket(harness, accessToken);
    harness.lab.activateFaultFixture("duplicate-event-delivery");
    harness.lab.publishEvent({ type: "thread-state", threadId: "dup", status: "idle" });
    expect(await next()).toMatchObject({ type: "event", seq: 1 });
    expect(await next()).toMatchObject({ type: "event", seq: 1 });
    ws.close();
  });
});
