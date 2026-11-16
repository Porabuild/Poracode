import { mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activateInstalledRelease } from "./cliInstallActivate";
import { acquireServerUpgradeLock } from "./serverUpgradeLock";

describe.runIf(process.platform !== "win32")("installer activation", () => {
  it("cannot switch current while migration holds the prefix lifecycle lock", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-install-activate-")));
    try {
      const prefix = join(root, "prefix");
      const release = join(prefix, "releases", "candidate");
      mkdirSync(release, { recursive: true });
      writeFileSync(
        join(release, "standalone.json"),
        JSON.stringify({
          formatVersion: 1,
          kind: "poracode-standalone-runtime",
          version: "2.0.0",
          target: "darwin-arm64",
          node: { version: "26.13.0", executable: "runtime/node" },
        }),
      );
      const lock = acquireServerUpgradeLock({ prefix, releaseId: "migration" });
      try {
        expect(() => activateInstalledRelease(prefix, release)).toThrow(/already in progress/u);
      } finally {
        lock.release();
      }
      activateInstalledRelease(prefix, release);
      expect(readlinkSync(join(prefix, "current"))).toBe("releases/candidate");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
