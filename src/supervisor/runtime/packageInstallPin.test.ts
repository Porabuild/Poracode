import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PACKAGE_INSTALL_PIN_FILE_VERSION,
  forgetPackageInstallPin,
  readPackageInstallPin,
  recordPackageInstallPin,
} from "./packageInstallPin";

const SLOT = "some-agent-sdk";
const PACKAGE_NAME = "@some/agent-sdk";

const directories: string[] = [];
let pinsPath = "";

function makePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-pin-package-"));
  directories.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: PACKAGE_NAME }), "utf8");
  return root;
}

function pinFor(packageRoot: string, version = "1.0.0") {
  return {
    packageName: PACKAGE_NAME,
    packageRoot,
    version,
    source: "global-npm",
    resolvedAt: "2026-09-12T00:00:00.000Z",
  };
}

function writeRawPinFile(value: unknown): void {
  writeFileSync(pinsPath, JSON.stringify(value), "utf8");
}

beforeEach(() => {
  const baseDir = mkdtempSync(join(tmpdir(), "poracode-pin-store-"));
  directories.push(baseDir);
  pinsPath = join(baseDir, "package-install-pins.json");
});

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

describe("packageInstallPin", () => {
  it("records an installation and reads it back", () => {
    const packageRoot = makePackageRoot();
    recordPackageInstallPin(SLOT, pinFor(packageRoot, "1.4.2"), { pinsPath });

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toEqual(
      pinFor(packageRoot, "1.4.2"),
    );
  });

  it("keeps other slots intact when one is recorded", () => {
    const first = makePackageRoot();
    const second = makePackageRoot();
    recordPackageInstallPin(SLOT, pinFor(first), { pinsPath });
    recordPackageInstallPin(
      "other-slot",
      { ...pinFor(second), packageName: "@other/sdk" },
      { pinsPath },
    );

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })?.packageRoot).toBe(first);
    expect(readPackageInstallPin("other-slot", "@other/sdk", { pinsPath })?.packageRoot).toBe(
      second,
    );
  });

  it("does not rewrite the file when nothing changed", () => {
    const packageRoot = makePackageRoot();
    recordPackageInstallPin(SLOT, pinFor(packageRoot), { pinsPath });
    const written = readFileSync(pinsPath, "utf8");

    recordPackageInstallPin(
      SLOT,
      { ...pinFor(packageRoot), resolvedAt: "2026-01-01T00:00:00.000Z" },
      { pinsPath },
    );

    // Repeated detection must not churn the file on every pass.
    expect(readFileSync(pinsPath, "utf8")).toBe(written);
  });

  it("reads nothing when no file exists", () => {
    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toBeUndefined();
  });

  it("discards a document from an unknown generation", () => {
    writeRawPinFile({
      version: PACKAGE_INSTALL_PIN_FILE_VERSION + 1,
      pins: { [SLOT]: pinFor(makePackageRoot()) },
    });

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toBeUndefined();
  });

  it("reads nothing when the record belongs to a different package", () => {
    recordPackageInstallPin(SLOT, pinFor(makePackageRoot()), { pinsPath });

    expect(readPackageInstallPin(SLOT, "@renamed/package", { pinsPath })).toBeUndefined();
  });

  it("reads nothing once the recorded root stops holding a package", () => {
    const packageRoot = makePackageRoot();
    recordPackageInstallPin(SLOT, pinFor(packageRoot), { pinsPath });
    rmSync(join(packageRoot, "package.json"));

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toBeUndefined();
    expect(existsSync(pinsPath)).toBe(true);
  });

  it("survives an unparseable file instead of throwing", () => {
    writeFileSync(pinsPath, "{ not json", "utf8");
    const packageRoot = makePackageRoot();

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toBeUndefined();
    recordPackageInstallPin(SLOT, pinFor(packageRoot), { pinsPath });
    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })?.packageRoot).toBe(packageRoot);
  });

  it("drops a slot on request and leaves the rest", () => {
    const stale = makePackageRoot();
    const kept = makePackageRoot();
    recordPackageInstallPin(SLOT, pinFor(stale), { pinsPath });
    recordPackageInstallPin(
      "other-slot",
      { ...pinFor(kept), packageName: "@other/sdk" },
      { pinsPath },
    );

    forgetPackageInstallPin(SLOT, { pinsPath });

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toBeUndefined();
    expect(readPackageInstallPin("other-slot", "@other/sdk", { pinsPath })?.packageRoot).toBe(kept);
  });

  it("ignores a forget when nothing was ever recorded", () => {
    forgetPackageInstallPin(SLOT, { pinsPath });
    expect(existsSync(pinsPath)).toBe(false);
  });

  it("treats an unwritable location as a no-op rather than an error", () => {
    // A directory where a file is expected: every read and write fails.
    mkdirSync(pinsPath, { recursive: true });
    const packageRoot = makePackageRoot();

    expect(readPackageInstallPin(SLOT, PACKAGE_NAME, { pinsPath })).toBeUndefined();
    expect(() => recordPackageInstallPin(SLOT, pinFor(packageRoot), { pinsPath })).not.toThrow();
    expect(() => forgetPackageInstallPin(SLOT, { pinsPath })).not.toThrow();
  });
});
