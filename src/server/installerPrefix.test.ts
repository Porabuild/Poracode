import { resolve, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultInstallerPrefix } from "./installerPrefix";

describe("installerPrefix", () => {
  it("resolves the installer's default prefix like the installers do", () => {
    expect(defaultInstallerPrefix({ platform: "linux", env: {}, home: "/home/u" })).toBe(
      "/home/u/.local/share/poracode/server",
    );
    expect(
      defaultInstallerPrefix({
        platform: "linux",
        env: { PORACODE_INSTALL_DIR: " rel/dir " },
        home: "/home/u",
      }),
    ).toBe(resolve("rel/dir"));
    expect(
      defaultInstallerPrefix({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" },
        home: "C:\\Users\\a",
      }),
    ).toBe(win32.join("C:\\Users\\a\\AppData\\Local", "Poracode", "server"));
    expect(defaultInstallerPrefix({ platform: "win32", env: {}, home: "C:\\Users\\a" })).toBe(
      win32.join("C:\\Users\\a", "AppData", "Local", "Poracode", "server"),
    );
  });
});
