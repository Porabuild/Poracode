import { describe, expect, it } from "vitest";
import { claudeNativeChromeArgs, claudeSdkNativeChromeArgs } from "./nativeChrome";

const location = { kind: "posix" as const, path: "/project" };

describe("native Claude browser startup", () => {
  it.each([undefined, {}, { noFlicker: false }])(
    "enables native browser access for pre-upgrade settings %j",
    (settings) => {
      expect(claudeNativeChromeArgs(location, settings)).toEqual(["--chrome"]);
      expect(claudeSdkNativeChromeArgs(location, settings)).toEqual({ chrome: null });
    },
  );

  it.each([
    [true, "--chrome"],
    [false, "--no-chrome"],
  ] as const)("honors an explicit browser choice of %s in both presentations", (choice, flag) => {
    const settings = { chromeIntegration: choice };
    expect(claudeNativeChromeArgs(location, settings)).toEqual([flag]);
    expect(claudeSdkNativeChromeArgs(location, settings)).toEqual({ [flag.slice(2)]: null });
  });

  it("enables supported native Windows browser access by default", () => {
    const windows = { kind: "windows", path: "C:\\project" } as const;
    expect(claudeNativeChromeArgs(windows, undefined)).toEqual(["--chrome"]);
    expect(claudeSdkNativeChromeArgs(windows, undefined)).toEqual({ chrome: null });
  });

  it("keeps unsupported WSL browser access off even with explicit opt-in", () => {
    const wsl = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/project",
      uncPath: "\\\\wsl$\\Ubuntu\\project",
    };
    const settings = { chromeIntegration: true };
    expect(claudeNativeChromeArgs(wsl, settings)).toEqual(["--no-chrome"]);
    expect(claudeSdkNativeChromeArgs(wsl, settings)).toEqual({ "no-chrome": null });
  });
});
