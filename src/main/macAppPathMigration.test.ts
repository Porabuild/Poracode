import { lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repairLegacyMacAppPath } from "./macAppPathMigration";

describe("repairLegacyMacAppPath", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "poracode-mac-app-path-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function packagedExecutable(appName: string): string {
    const executablePath = join(root, appName, "Contents", "MacOS", appName.replace(/\.app$/u, ""));
    mkdirSync(join(root, appName, "Contents", "MacOS"), { recursive: true });
    writeFileSync(executablePath, "executable");
    return executablePath;
  }

  it("restores the legacy Nightly path as a relative symlink", () => {
    const executablePath = packagedExecutable("Poracode Nightly.app");

    expect(
      repairLegacyMacAppPath("nightly", {
        platform: "darwin",
        isPackaged: true,
        executablePath,
      }),
    ).toBe("created");

    const legacyPath = join(root, "Lightcode Nightly.app");
    expect(lstatSync(legacyPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(legacyPath)).toBe("Poracode Nightly.app");
  });

  it("restores the legacy Stable path", () => {
    const executablePath = packagedExecutable("Poracode.app");

    expect(
      repairLegacyMacAppPath("stable", {
        platform: "darwin",
        isPackaged: true,
        executablePath,
      }),
    ).toBe("created");
    expect(readlinkSync(join(root, "Lightcode.app"))).toBe("Poracode.app");
  });

  it("never replaces an existing legacy app", () => {
    const executablePath = packagedExecutable("Poracode Nightly.app");
    const legacyPath = join(root, "Lightcode Nightly.app");
    mkdirSync(legacyPath);

    expect(
      repairLegacyMacAppPath("nightly", {
        platform: "darwin",
        isPackaged: true,
        executablePath,
      }),
    ).toBe("skipped");
    expect(lstatSync(legacyPath).isDirectory()).toBe(true);
  });

  it("skips unpackaged, non-macOS, and unexpectedly named bundles", () => {
    const executablePath = packagedExecutable("Poracode Nightly.app");
    const otherExecutablePath = packagedExecutable("Renamed.app");

    expect(
      repairLegacyMacAppPath("nightly", {
        platform: "linux",
        isPackaged: true,
        executablePath,
      }),
    ).toBe("skipped");
    expect(
      repairLegacyMacAppPath("nightly", {
        platform: "darwin",
        isPackaged: false,
        executablePath,
      }),
    ).toBe("skipped");
    expect(
      repairLegacyMacAppPath("nightly", {
        platform: "darwin",
        isPackaged: true,
        executablePath: otherExecutablePath,
      }),
    ).toBe("skipped");
  });
});
