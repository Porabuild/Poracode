import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearUsageSecret,
  getUsageSecret,
  setUsageSecret,
  usageSecretsPath,
} from "./usageSecretStore";

describe("usageSecretStore", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "lc-secrets-"));
  });
  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("seals on disk and round-trips the plaintext", () => {
    setUsageSecret(cacheDir, "grok", "cookie", "session=abc123");
    // On-disk value must be encrypted, never the plaintext.
    const raw = readFileSync(usageSecretsPath(cacheDir), "utf8");
    expect(raw).not.toContain("session=abc123");
    expect(raw).toContain("lc-safe:v1:");
    expect(getUsageSecret(cacheDir, "grok", "cookie")).toBe("session=abc123");
  });

  it("returns undefined for absent provider/key", () => {
    expect(getUsageSecret(cacheDir, "grok", "cookie")).toBeUndefined();
    setUsageSecret(cacheDir, "grok", "cookie", "x");
    expect(getUsageSecret(cacheDir, "grok", "missing")).toBeUndefined();
  });

  it("clears a single key and the bucket when emptied", () => {
    setUsageSecret(cacheDir, "grok", "cookie", "x");
    clearUsageSecret(cacheDir, "grok", "cookie");
    expect(getUsageSecret(cacheDir, "grok", "cookie")).toBeUndefined();
  });
});
