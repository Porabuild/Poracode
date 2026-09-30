import { afterEach, describe, expect, it } from "vitest";
import { pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("catalogued route fixtures", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("returns a schema-validated deterministic agent status inventory", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const response = await fetch(new URL("/api/agent-statuses", harness.httpBaseUrl), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      windows: unknown[];
      wsl: unknown[];
      updatedAt: string;
    };
    expect(body.wsl).toEqual([]);
    expect(body.windows).toHaveLength(1);
    const native = body.windows[0] as {
      kind: string;
      installed: boolean;
      envKind: string;
      capabilities: { presentationModes: string[]; models: { id: string }[] };
    };
    expect(native).toMatchObject({
      kind: "codex",
      installed: true,
      envKind: "posix",
    });
    expect(native.capabilities.presentationModes).toEqual(["gui", "terminal"]);
    expect(native.capabilities.models).toEqual([{ id: "gpt-5", label: "Fixture model" }]);
    expect(body.updatedAt).toBe("2026-08-12T10:03:00.000Z");
    const record = harness.lab.ledger.snapshot().operations["route:agent-statuses"];
    expect(record?.attempted).toBeGreaterThan(0);
    expect(record?.status).toBe("mock-passed");
  });

  it("validates and positively exercises thread-runtime-truncate", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const response = await fetch(
      new URL("/api/threads/thread-fixture-001/runtime/truncate", harness.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ itemId: "item-fixture-assistant" }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const history = await fetch(
      new URL("/api/threads/thread-fixture-001/history", harness.httpBaseUrl),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    expect(history.status).toBe(200);
    expect(harness.lab.ledger.snapshot().operations["route:thread-runtime-truncate"]?.status).toBe(
      "mock-passed",
    );
  });

  it("validates and positively exercises thread-checkpoint-revert", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const response = await fetch(
      new URL("/api/threads/thread-fixture-001/checkpoint-revert", harness.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-poracode-command-id": "fixture-checkpoint-revert-1",
        },
        body: JSON.stringify({
          checkpointItemId: "item-fixture-assistant",
          operationKey: "fixture-op-key-1",
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcome: "completed",
      replayed: false,
      numTurns: 0,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "noop",
      removedCompletedTurnAnchors: [],
    });
    expect(
      harness.lab.ledger.snapshot().operations["route:thread-checkpoint-revert"]?.attempted,
    ).toBeGreaterThan(0);
    // A follow-up history read confirms the mutation and promotes the ledger
    // record to mock-passed (the same lifecycle truncate exercises).
    const history = await fetch(
      new URL("/api/threads/thread-fixture-001/history", harness.httpBaseUrl),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    expect(history.status).toBe(200);
    expect(harness.lab.ledger.snapshot().operations["route:thread-checkpoint-revert"]?.status).toBe(
      "mock-passed",
    );
  });
});
