import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "./harness/paths.ts";
import {
  cleanupRunDirectory,
  createRunDirectory,
  isValidatedRunDirectory,
  parseSlot,
  portsForSlot,
  statMode,
} from "./harness/runDirectory.ts";
import { NATIVE_E2E_PORT_BASE } from "./harness/versions.ts";

describe("versioned run directory and slot ports", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const path of created) {
      if (isValidatedRunDirectory(path)) cleanupRunDirectory(path, { keep: false });
    }
    created.length = 0;
  });

  it("creates a 0700 marker-bearing run dir with 0600 secrets", () => {
    const run = createRunDirectory();
    created.push(run.path);
    expect(run.path.includes("/.tmp/native-e2e/run-")).toBe(true);
    expect(statMode(run.path)).toBe(0o700);
    expect(statMode(run.secretsDir)).toBe(0o700);
    expect(statMode(run.markerPath)).toBe(0o600);
    expect(isValidatedRunDirectory(run.path)).toBe(true);
  });

  it("refuses to recursively delete a path that is not a marked run dir", () => {
    const decoy = join(findRepoRoot(), ".tmp", "native-e2e", "not-a-run");
    mkdirSync(decoy, { recursive: true });
    expect(() => cleanupRunDirectory(decoy)).toThrow(/Refusing to remove/);
  });

  it("KEEP deletes secrets but retains the marked run dir", () => {
    const run = createRunDirectory({ keep: true });
    created.push(run.path);
    writeFileSync(join(run.secretsDir, "pairing.json"), '{"credential":"lc_pair_x"}\n', {
      mode: 0o600,
    });
    writeFileSync(join(run.path, "journal.json"), "{}\n");
    cleanupRunDirectory(run.path, { keep: true });
    expect(existsSync(run.path)).toBe(true);
    expect(existsSync(run.secretsDir)).toBe(false);
    expect(existsSync(join(run.path, "journal.json"))).toBe(true);
    cleanupRunDirectory(run.path, { keep: false });
    created.pop();
  });

  it("maps PORACODE_NATIVE_E2E_SLOT to the reserved port block", () => {
    const slot = portsForSlot(2);
    expect(slot.base).toBe(NATIVE_E2E_PORT_BASE + 16);
    expect(slot.appHost).toBe(slot.base);
    expect(slot.control).toBe(slot.base + 1);
    expect(slot.relay).toBe(slot.base + 2);
    expect(slot.productionHost).toBe(slot.base + 3);
    expect(slot.upstream).toBe(slot.base + 4);
    expect(() => parseSlot("-1")).toThrow(/non-negative/);
    expect(() => parseSlot("99999")).toThrow(/exceeds/);
  });
});
