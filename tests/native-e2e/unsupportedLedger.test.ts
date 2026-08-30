import { afterEach, describe, expect, it } from "vitest";
import { exerciseCoreLifecycle } from "./helpers/coreScenario.ts";
import { exerciseAllProcedures, exerciseRemainingRoutes } from "./helpers/fullParityScenario.ts";
import { issueTicket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("full inventory support ledger", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("has no residual route or procedure gaps in the deterministic mock profile", async () => {
    harness = await startLab();
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
    expect((await issueTicket(harness.httpBaseUrl, accessToken)).status).toBe(200);
    const snapshot = harness.lab.ledger.snapshot();
    expect(snapshot.unsupported.httpRouteIds).toEqual([]);
    expect(snapshot.unsupported.procedureNames).toEqual([]);
    expect(snapshot.missing.httpRouteIds).toEqual([]);
    expect(snapshot.missing.procedureNames).toEqual([]);
    expect(snapshot.counts.route.positive).toBe(61);
    expect(snapshot.counts.procedure.positive).toBe(100);
  });
});
