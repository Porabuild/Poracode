import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { preparePoracodeDataRoot } from "./poracodeData";

describe("preparePoracodeDataRoot", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("creates the canonical base directories and is idempotent", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-data-root-"));
    const paths = preparePoracodeDataRoot(tempDir);
    for (const directory of [
      paths.baseDir,
      paths.worktreesDir,
      paths.attachmentsDir,
      paths.logsDir,
      paths.cacheDir,
    ]) {
      expect(existsSync(directory)).toBe(true);
    }
    const again = preparePoracodeDataRoot(tempDir);
    expect(again.attachmentsDir).toBe(paths.attachmentsDir);
  });
});
