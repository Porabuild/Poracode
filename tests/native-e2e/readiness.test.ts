import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeReadinessDescriptor } from "./harness/readiness.ts";
import { collectSecretViolations } from "./harness/secrets.ts";
import type { ReadinessDescriptor } from "./harness/types.ts";

describe("readiness descriptor", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("writes mode 0600 JSON without secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "native-e2e-ready-"));
    dirs.push(dir);
    const path = join(dir, "ready.json");
    const descriptor: ReadinessDescriptor = {
      schemaVersion: 1,
      mode: "mock",
      scenario: "mock-foundation",
      protocolVersion: 8,
      bindingFormatVersion: 2,
      manifestHash: "sha256:deadbeef",
      ledgerFormatVersion: 2,
      scenarioFormatVersion: 1,
      runDirVersion: 1,
      bindHost: "127.0.0.1",
      ports: {
        appHost: 49152,
        control: 49153,
        relay: 49154,
        productionHost: 49155,
        upstream: 49156,
      },
      pids: { supervisor: 1 },
      httpBaseUrl: "http://127.0.0.1:49152/",
      wsBaseUrl: "ws://127.0.0.1:49152/",
      environmentPath: "/.well-known/poracode/environment",
      websocketPath: "/ws",
      basePath: "",
      scenarioApi: {
        formatVersion: 1,
        descriptorPath: "/v1/scenario",
        statePath: "/v1/scenario/state",
        actionPath: "/v1/scenario/actions",
        authScheme: "harness-capability",
        pairing: "action-result-only",
      },
    };
    writeReadinessDescriptor(path, descriptor);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(collectSecretViolations(parsed)).toEqual([]);
    expect(JSON.stringify(parsed)).not.toMatch(/lc_(pair|access|ws)_/);
    expect(parsed).not.toHaveProperty("capability");
    expect(parsed).not.toHaveProperty("ticket");
    expect(parsed).not.toHaveProperty("accessToken");
    expect(parsed.scenarioApi).toMatchObject({ formatVersion: 1, pairing: "action-result-only" });
  });
});
