import { describe, expect, it, vi } from "vitest";
import {
  resolveDefaultWslDistro,
  windowsProjectLocationInWsl,
  type WslCommandRunner,
} from "./projectLocation";

describe("Windows project WSL execution location", () => {
  it("reads the default distro from its own WSL environment", async () => {
    const run = vi.fn<WslCommandRunner>().mockResolvedValue("Ubuntu\n");

    await expect(resolveDefaultWslDistro(undefined, run)).resolves.toBe("Ubuntu");
    expect(run).toHaveBeenCalledWith(
      ["--exec", "sh", "-lc", 'printf "%s" "${WSL_DISTRO_NAME:-}"'],
      undefined,
    );
  });

  it("translates a native Windows project path in the selected distro", async () => {
    const run = vi
      .fn<WslCommandRunner>()
      .mockResolvedValueOnce("Ubuntu\n")
      .mockResolvedValueOnce("/mnt/e/work/app\n");

    await expect(
      windowsProjectLocationInWsl(
        { kind: "windows", path: "E:\\work\\app", remoteServerId: "desktop" },
        undefined,
        run,
      ),
    ).resolves.toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/e/work/app",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\e\\work\\app",
      remoteServerId: "desktop",
    });
    expect(run).toHaveBeenLastCalledWith(
      ["-d", "Ubuntu", "--exec", "wslpath", "-a", "-u", "E:\\work\\app"],
      undefined,
    );
  });

  it("rejects an empty default distro and an invalid translated path", async () => {
    await expect(
      resolveDefaultWslDistro(undefined, vi.fn<WslCommandRunner>().mockResolvedValue("")),
    ).rejects.toThrow("default WSL distribution");
    await expect(
      windowsProjectLocationInWsl(
        { kind: "windows", path: "E:\\work\\app" },
        undefined,
        vi
          .fn<WslCommandRunner>()
          .mockResolvedValueOnce("Ubuntu")
          .mockResolvedValueOnce("E:\\work\\app"),
      ),
    ).rejects.toThrow("could not translate");
  });
});
