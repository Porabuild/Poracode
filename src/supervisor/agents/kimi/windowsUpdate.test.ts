import { afterEach, describe, expect, it } from "vitest";
import { createWindowsInstallerModuleFixture } from "../base/windowsInstallerModule.testFixtures";
import { kimiDetectionSpec } from "./detection";

describe.runIf(process.platform === "win32")("Kimi Windows updater modules", () => {
  const fixture = createWindowsInstallerModuleFixture(
    kimiDetectionSpec.update?.installer?.windows,
    "https://code.kimi.com/kimi-code/install.ps1",
  );
  afterEach(fixture.cleanup);

  it("reproduces the released updater's checksum failure with Core modules first", async () => {
    const result = await fixture.runInstaller(true, true);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("Get-FileHash");
  });

  it("runs the released checksum command with clean native modules", async () => {
    expect(await fixture.runInstaller(false, true)).toEqual({
      ok: true,
      stdout: fixture.sha256,
      stderr: "",
    });
  });

  it.each([true, false])(
    "checks the installer payload with polluted module path: %s",
    async (polluted) => {
      const result = await fixture.runInstaller(polluted);
      expect(result).toEqual({
        ok: true,
        stdout: fixture.sha256,
        stderr: "",
      });
    },
  );
});
