import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumePairingSecret,
  pairingSecretExists,
  pairingSecretPath,
} from "./harness/pairingSecrets.ts";
import {
  cleanupRunDirectory,
  createRunDirectory,
  isValidatedRunDirectory,
  statMode,
} from "./harness/runDirectory.ts";
import { collectSecretViolations } from "./harness/secrets.ts";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import { controlRequest, exchangeToken, startLab } from "./helpers/testClient.ts";

describe("secret-free state and log output", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;
  const runDirs: string[] = [];

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
    for (const path of runDirs) {
      if (isValidatedRunDirectory(path)) cleanupRunDirectory(path, { keep: false });
    }
    runDirs.length = 0;
  });

  it("never returns access or pairing tokens from /state", async () => {
    harness = await startLab();
    const pairing = harness.lab.issuePairingUrl();
    const credential = pairingTokenFromUrl(pairing.pairingUrl);
    await exchangeToken(harness.httpBaseUrl, credential, ["session:read"]);

    const response = await controlRequest(harness, "/v1/state");
    expect(response.status).toBe(200);
    const state = (await response.json()) as Record<string, unknown>;
    expect(collectSecretViolations(state)).toEqual([]);
    expect(state).not.toHaveProperty("accessToken");
    expect(state).not.toHaveProperty("credential");
    expect(state).not.toHaveProperty("ticket");
    expect(state).not.toHaveProperty("pairingUrl");
    expect(JSON.stringify(state)).not.toContain("lc_pair_");
    expect(JSON.stringify(state)).not.toContain("lc_access_");
    expect(JSON.stringify(state)).not.toContain("lc_ws_");
    expect(state.pairingOutstanding).toBe(false);
    expect(state.accessSessionCount).toBe(1);
  });

  it("rejects a control request without the capability", async () => {
    harness = await startLab();
    const response = await fetch(new URL("/v1/state", harness.controlUrl));
    expect(response.status).toBe(401);
  });

  it("writes a 0600 pairing file and deletes it after token exchange", async () => {
    const run = createRunDirectory();
    runDirs.push(run.path);
    harness = await startLab({ secretsDir: run.secretsDir });
    const secretPath = pairingSecretPath(run.secretsDir);
    expect(pairingSecretExists(run.secretsDir)).toBe(true);
    expect(statMode(secretPath)).toBe(0o600);
    const recorded = JSON.parse(readFileSync(secretPath, "utf8")) as { credential: string };
    expect(recorded.credential.startsWith("lc_pair_")).toBe(true);

    const exchanged = await exchangeToken(harness.httpBaseUrl, recorded.credential, [
      "session:read",
    ]);
    expect(exchanged.status).toBe(200);
    expect(pairingSecretExists(run.secretsDir)).toBe(false);
    expect(existsSync(secretPath)).toBe(false);

    const replay = await exchangeToken(harness.httpBaseUrl, recorded.credential, ["session:read"]);
    expect(replay.status).toBe(401);
  });

  it("consumes the pairing file exactly once when the runner reads it", async () => {
    const run = createRunDirectory();
    runDirs.push(run.path);
    harness = await startLab({ secretsDir: run.secretsDir });
    const first = consumePairingSecret(run.secretsDir);
    expect(first.credential.startsWith("lc_pair_")).toBe(true);
    expect(pairingSecretExists(run.secretsDir)).toBe(false);
    expect(() => consumePairingSecret(run.secretsDir)).toThrow(/ENOENT|no such file/i);
  });
});
