import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearUsageSecret,
  getUsageSecret,
  hasUsageSecret,
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

  it("keeps sibling keys when clearing one, and drops the bucket once empty", () => {
    setUsageSecret(cacheDir, "copilot", "cookie", "c");
    setUsageSecret(cacheDir, "copilot", "token", "t");

    // Clearing one key leaves the other intact and the bucket present.
    clearUsageSecret(cacheDir, "copilot", "cookie");
    expect(getUsageSecret(cacheDir, "copilot", "cookie")).toBeUndefined();
    expect(getUsageSecret(cacheDir, "copilot", "token")).toBe("t");
    expect(hasUsageSecret(cacheDir, "copilot")).toBe(true);

    // Clearing the last key removes the whole provider bucket from disk.
    clearUsageSecret(cacheDir, "copilot", "token");
    expect(hasUsageSecret(cacheDir, "copilot")).toBe(false);
    const raw = JSON.parse(readFileSync(usageSecretsPath(cacheDir), "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw.copilot).toBeUndefined();
  });

  it("clears the whole bucket when no key is given", () => {
    setUsageSecret(cacheDir, "grok", "cookie", "c");
    setUsageSecret(cacheDir, "grok", "token", "t");
    clearUsageSecret(cacheDir, "grok");
    expect(hasUsageSecret(cacheDir, "grok")).toBe(false);
  });
});
