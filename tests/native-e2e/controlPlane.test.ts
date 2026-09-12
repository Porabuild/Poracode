import { afterEach, describe, expect, it } from "vitest";
import { collectSecretViolations } from "./harness/secrets.ts";
import { controlRequest, startLab } from "./helpers/testClient.ts";

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
