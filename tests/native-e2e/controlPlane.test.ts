import { afterEach, describe, expect, it } from "vitest";
import { collectSecretViolations } from "./harness/secrets.ts";
import { controlRequest, startLab } from "./helpers/testClient.ts";
import { resolveRouteSchemas } from "./harness/schemaValidation.ts";

const CONTROL_PATHS = [
  "/healthz",
  "/v1/state",
  "/v1/reset",
  "/v1/faults/delay-token",
  "/v1/frames/event-thread-state",
  "/v1/checkpoints/seed-pairing",
  "/v1/real/restart",
] as const;

describe("secret-free versioned control plane", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("publishes composer capabilities only through its explicit checkpoint", async () => {
    harness = await startLab();
    expect(harness.lab.ring.seq).toBe(0);
    const prepared = await controlRequest(harness, "/v1/checkpoints/composer-controls-ready", {
      method: "POST",
    });
    expect(prepared.status).toBe(200);
    expect(harness.lab.ring.seq).toBe(2);
    expect(collectSecretViolations(await prepared.json())).toEqual([]);
    const reset = await controlRequest(harness, "/v1/reset", { method: "POST" });
    expect(reset.status).toBe(200);
    expect(harness.lab.ring.seq).toBe(0);
  });

  it("keeps the family-selector inventory opt-in and resets it with the lab", async () => {
    harness = await startLab();
    expect(harness.lab.ring.seq).toBe(0);
    const prepared = await controlRequest(harness, "/v1/checkpoints/composer-family-ready", {
      method: "POST",
    });
    expect(prepared.status).toBe(200);
    expect(harness.lab.ring.seq).toBe(1);
    expect(collectSecretViolations(await prepared.json())).toEqual([]);
    await controlRequest(harness, "/v1/reset", { method: "POST" });
    expect(harness.lab.ring.seq).toBe(0);
  });

  it("denies every authenticated control route without a Harness capability", async () => {
    harness = await startLab();
    for (const path of CONTROL_PATHS) {
      if (path === "/healthz") continue;
      const method = path === "/v1/state" ? "GET" : "POST";
      const response = await fetch(new URL(path, harness.controlUrl), { method });
      expect(response.status).toBe(401);
      const body = (await response.json()) as unknown;
      expect(collectSecretViolations(body)).toEqual([]);
    }
  });

  it("keeps timed conversations opt-in and restores the default history on reset", async () => {
    harness = await startLab();
    const before = harness.lab.lifecycle.history(0);
    await controlRequest(harness, "/v1/checkpoints/thread-timing-ready", { method: "POST" });
    const history = harness.lab.lifecycle.history(harness.lab.ring.seq);
    expect(history.completedTurns).toHaveLength(2);
    expect(history.runtimeItems).toHaveLength(5);
    expect(resolveRouteSchemas("thread-history").responseSchema?.safeParse(history).success).toBe(
      true,
    );
    const snapshot = harness.lab.lifecycle.shellSnapshot(
      harness.lab.ring.seq,
      harness.lab.ring.epoch,
    );
    expect(resolveRouteSchemas("shell-snapshot").responseSchema?.safeParse(snapshot).success).toBe(
      true,
    );
    await controlRequest(harness, "/v1/reset", { method: "POST" });
    expect(harness.lab.lifecycle.history(0)).toEqual(before);
  });

  it("keeps composer tool edits scoped and restores the ordinary catalog on reset", async () => {
    harness = await startLab();
    await controlRequest(harness, "/v1/checkpoints/composer-tools-ready", { method: "POST" });
    const tools = harness.lab.lifecycle.composerTools;
    const globals = tools.response("mcp-settings-read", {}) as {
      servers: Array<Record<string, unknown>>;
    };
    expect(
      resolveRouteSchemas("mcp-settings-read").responseSchema?.safeParse(globals).success,
    ).toBe(true);
    const projectId = "project-fixture-001";
    const workspace = harness.lab.lifecycle.projectSettings(projectId)?.mcpServers as Array<
      Record<string, unknown>
    >;
    const command = {
      kind: "upsert",
      scope: { kind: "project", projectId },
      server: { ...workspace[0], enabled: true },
    };
    expect(
      resolveRouteSchemas("mcp-settings-command").requestSchema?.safeParse(command).success,
    ).toBe(true);
    const response = tools.response("mcp-settings-command", command);
    expect(
      resolveRouteSchemas("mcp-settings-command").responseSchema?.safeParse(response).success,
    ).toBe(true);
    expect(harness.lab.lifecycle.projectSettings(projectId)?.mcpServers).toEqual([
      { ...workspace[0], enabled: true },
    ]);
    expect(tools.response("mcp-settings-read", {})).toEqual(globals);
    await controlRequest(harness, "/v1/reset", { method: "POST" });
    expect(tools.enabled).toBe(false);
    expect(harness.lab.lifecycle.projectSettings(projectId)?.mcpServers).toEqual([]);
  });

  it("secret-scans every successful control response and never exposes pairing or tokens", async () => {
    harness = await startLab();
    const checks: Array<{ path: string; method: string; status: number }> = [];
    for (const path of CONTROL_PATHS) {
      const method = path === "/healthz" || path === "/v1/state" ? "GET" : "POST";
      const response = await controlRequest(harness, path, { method });
      const body = (await response.json()) as Record<string, unknown>;
      expect(collectSecretViolations(body)).toEqual([]);
      expect(JSON.stringify(body)).not.toMatch(/lc_(pair|access|ws)_/);
      expect(body).not.toHaveProperty("pairingUrl");
      expect(body).not.toHaveProperty("accessToken");
      expect(body).not.toHaveProperty("ticket");
      expect(body).not.toHaveProperty("capability");
      checks.push({ path, method, status: response.status });
    }
    expect(checks.find((entry) => entry.path === "/healthz")?.status).toBe(200);
    expect(checks.find((entry) => entry.path === "/v1/state")?.status).toBe(200);
    expect(checks.find((entry) => entry.path === "/v1/real/restart")?.status).toBe(409);
  });

  it("gates the real-peer pairing mint and refuses it where no real host exists", async () => {
    harness = await startLab();
    const denied = await fetch(new URL("/v1/real/pairing-url", harness.controlUrl), {
      method: "POST",
    });
    expect(denied.status).toBe(401);
    const unavailable = await controlRequest(harness, "/v1/real/pairing-url", { method: "POST" });
    expect(unavailable.status).toBe(409);
    const body = (await unavailable.json()) as Record<string, unknown>;
    expect(collectSecretViolations(body)).toEqual([]);
    expect(body).not.toHaveProperty("pairingUrl");
  });

  it("rejects removed pairing, emit, and shutdown control APIs", async () => {
    harness = await startLab();
    for (const path of ["/pair", "/emit", "/shutdown", "/state", "/fault", "/ledger"]) {
      const response = await controlRequest(harness, path, { method: "POST" });
      expect(response.status).toBe(404);
      expect(collectSecretViolations(await response.json())).toEqual([]);
    }
  });

  it("rejects arbitrary fault bodies and unknown fixture ids", async () => {
    harness = await startLab();
    const unknown = await controlRequest(harness, "/v1/faults/not-a-fixture", { method: "POST" });
    expect(unknown.status).toBe(404);
    const invented = await controlRequest(harness, "/v1/frames/custom-payload", { method: "POST" });
    expect(invented.status).toBe(404);
  });
});
