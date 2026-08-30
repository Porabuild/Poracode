import { afterEach, describe, expect, it } from "vitest";
import { exerciseCoreLifecycle, exerciseCoreWebSocket } from "./helpers/coreScenario.ts";
import { exerciseAllProcedures, exerciseRemainingRoutes } from "./helpers/fullParityScenario.ts";
import { pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("native real-socket core coverage profile", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("positively exercises the complete 205-operation remote-v3 inventory", async () => {
    harness = await startLab({ replayLimit: 64 });
    const { accessToken } = await pairAndAuth(harness, [
      "session:read",
      "session:operate",
      "terminal:read",
      "terminal:operate",
      "requests:resolve",
      "projects:manage",
      "ports:forward",
    ]);
    await exerciseCoreLifecycle(harness, accessToken);
    await exerciseRemainingRoutes(harness, accessToken);
    await exerciseAllProcedures(harness, accessToken);
    await exerciseCoreWebSocket(harness, accessToken);

    const snapshot = harness.lab.ledger.snapshot();
    expect(snapshot.profile).toBe("core");
    expect(snapshot.foundationComplete).toBe(true);
    expect(snapshot.coreComplete).toBe(true);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.fullParityComplete).toBe(true);
    expect(snapshot.counts).toEqual({
      route: { expected: 60, positive: 60, unsupported: 0, missing: 0 },
      procedure: { expected: 100, positive: 100, unsupported: 0, missing: 0 },
      "ws-client": { expected: 8, positive: 8, unsupported: 0, missing: 0 },
      "ws-server": { expected: 9, positive: 9, unsupported: 0, missing: 0 },
      replay: { expected: 15, positive: 15, unsupported: 0, missing: 0 },
      runtime: { expected: 14, positive: 14, unsupported: 0, missing: 0 },
    });
    expect(snapshot.missing.httpRouteIds).toEqual([]);
    expect(snapshot.missing.procedureNames).toEqual([]);
    expect(snapshot.missing.webSocketClientTypes).toEqual([]);
    expect(snapshot.missing.webSocketServerTypes).toEqual([]);
    expect(snapshot.missing.replayableEventTypes).toEqual([]);
    expect(snapshot.missing.runtimeEventTypes).toEqual([]);
  });
});
