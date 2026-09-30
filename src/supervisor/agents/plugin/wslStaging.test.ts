import { describe, expect, it, vi } from "vitest";
import type { WslStagingService } from "../../wsl/staging/service";
import { readWslTextFile, writeWslTextFile } from "./wslStaging";

function fakeStaging() {
  const writeTextFile = vi.fn<WslStagingService["writeTextFile"]>(async () => undefined);
  const readTextFile = vi.fn<WslStagingService["readTextFile"]>(async () => null);
  return {
    staging: { writeTextFile, readTextFile } as unknown as WslStagingService,
    writeTextFile,
    readTextFile,
  };
}

describe("WSL plugin file IO host paths", () => {
  it("reaches DrvFs-backed paths through the Windows drive, not a UNC loop", async () => {
    const fake = fakeStaging();
    await writeWslTextFile("Ubuntu", "/mnt/c/work/app/settings.json", "{}", {
      staging: fake.staging,
    });
    expect(fake.writeTextFile).toHaveBeenCalledWith(
      "Ubuntu",
      "C:\\work\\app\\settings.json",
      "{}",
      undefined,
    );
  });

  it("keeps UNC paths for files inside the distro", async () => {
    const fake = fakeStaging();
    await readWslTextFile("Ubuntu", "/home/dev/.claude/settings.json", { staging: fake.staging });
    expect(fake.readTextFile).toHaveBeenCalledWith(
      "Ubuntu",
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\.claude\\settings.json",
      undefined,
    );
  });
});
