import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveElectronUserDataPath } from "./userDataPath";

describe("resolveElectronUserDataPath", () => {
  it("keeps explicit CDP or CLI userData outside PORACODE_BASE_DIR in unpackaged launches", () => {
    expect(
      resolveElectronUserDataPath({
        isPackaged: false,
        isDev: true,
        baseDirOverride: "/smoke/run/data",
        currentUserDataDir: "/smoke/run/userData",
        cdpUserDataDir: "/smoke/run/userData",
        cliUserDataDir: "/smoke/run/userData",
      }),
    ).toBe("/smoke/run/userData");

    expect(
      resolveElectronUserDataPath({
        isPackaged: false,
        isDev: true,
        baseDirOverride: "/smoke/run/data",
        currentUserDataDir: "/default/Electron",
        cdpUserDataDir: "/smoke/run/userData",
        cliUserDataDir: "",
      }),
    ).toBe("/smoke/run/userData");
  });

  it("ignores PORACODE_CDP_USER_DATA_DIR in packaged builds", () => {
    expect(
      resolveElectronUserDataPath({
        isPackaged: true,
        isDev: false,
        baseDirOverride: undefined,
        currentUserDataDir: "/Library/Application Support/Poracode",
        cdpUserDataDir: "/tmp/hijack",
      }),
    ).toBeUndefined();

    expect(
      resolveElectronUserDataPath({
        isPackaged: true,
        isDev: false,
        baseDirOverride: "/custom/profile",
        currentUserDataDir: "/Library/Application Support/Poracode",
        cdpUserDataDir: "/tmp/hijack",
      }),
    ).toBe(join("/custom/profile", "userData"));
  });

  it("falls back to baseDirOverride/userData or Dev suffix when no explicit userData is set", () => {
    expect(
      resolveElectronUserDataPath({
        isPackaged: false,
        isDev: true,
        baseDirOverride: "/custom/profile",
        currentUserDataDir: "/Library/Application Support/Poracode",
        cdpUserDataDir: "   ",
      }),
    ).toBe(join("/custom/profile", "userData"));

    expect(
      resolveElectronUserDataPath({
        isPackaged: false,
        isDev: true,
        baseDirOverride: undefined,
        currentUserDataDir: "/Library/Application Support/Poracode",
      }),
    ).toBe(join("/Library/Application Support/Poracode", "Dev"));

    expect(
      resolveElectronUserDataPath({
        isPackaged: false,
        isDev: false,
        baseDirOverride: undefined,
        currentUserDataDir: "/Library/Application Support/Poracode",
      }),
    ).toBeUndefined();
  });
});
