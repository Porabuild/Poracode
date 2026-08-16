import { afterEach, describe, expect, it } from "vitest";
import {
  GET_GIT_STATUS_PAYLOAD,
  GIT_STAGE_PAYLOAD,
  PROCEDURE_REQUEST_FIXTURES,
} from "./harness/contractFixtures.ts";
import { pairAndAuth, startLab } from "./helpers/testClient.ts";

async function callProcedure(
  httpBaseUrl: string,
  accessToken: string,
  procedure: string,
  payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL("/api/git/call", httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ procedure, payload }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("git/call procedure fixtures", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("returns a canonical {result:T} envelope for a configured non-void procedure", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const result = await callProcedure(
      harness.httpBaseUrl,
      accessToken,
      "getGitStatus",
      GET_GIT_STATUS_PAYLOAD,
    );
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("result");
    expect(result.body).not.toHaveProperty("ok");
    expect(result.body).not.toHaveProperty("procedure");
    expect((result.body.result as { branch: string }).branch).toBe("main");
  });

  it("returns {} for a configured void procedure and requires follow-up evidence", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const staged = await callProcedure(
      harness.httpBaseUrl,
      accessToken,
      "gitStage",
      GIT_STAGE_PAYLOAD,
    );
    expect(staged.status).toBe(200);
    expect(staged.body).toEqual({});
    const snapshot = harness.lab.ledger.snapshot();
    expect(snapshot.operations["procedure:gitStage"]?.status).toBe("unexercised");

    const followUp = await callProcedure(
      harness.httpBaseUrl,
      accessToken,
      "getGitStatus",
      GET_GIT_STATUS_PAYLOAD,
    );
    expect(followUp.status).toBe(200);
    const files = (followUp.body.result as { staged: Array<{ path: string }> }).staged;
    expect(files.map((file) => file.path)).toContain("README.md");
    expect(harness.lab.ledger.snapshot().operations["procedure:gitStage"]?.status).toBe(
      "mock-passed",
    );
  });

  it("returns 400 for an unknown procedure name", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const result = await callProcedure(harness.httpBaseUrl, accessToken, "notARealProcedure", {});
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: "unknown_procedure" } });
  });

  it("returns the producer-shaped result for a formerly unconfigured procedure", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const result = await callProcedure(
      harness.httpBaseUrl,
      accessToken,
      "gitCommit",
      PROCEDURE_REQUEST_FIXTURES.gitCommit,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ result: { hash: "abc123", message: "fix: parse" } });
    const record = harness.lab.ledger.snapshot().operations["procedure:gitCommit"];
    expect(record?.attempted).toBeGreaterThan(0);
    expect(record?.status).toBe("mock-passed");
  });
});
