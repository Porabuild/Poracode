import { describe, expect, it } from "vitest";
import { defaultServerPrefix } from "./serverDefaultPrefix";
import { parseUpgradeCliOptions } from "./serverUpgradeContract";

describe("default server prefix", () => {
  it("is /opt/poracode on POSIX and %LOCALAPPDATA%\\Poracode\\server on Windows", () => {
    expect(defaultServerPrefix("linux", {})).toBe("/opt/poracode");
    expect(defaultServerPrefix("win32", { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" })).toBe(
      "C:\\Users\\Ada\\AppData\\Local\\Poracode\\server",
    );
  });

  it("feeds the upgrade CLI default while an explicit --prefix still wins", () => {
    expect(parseUpgradeCliOptions(["--from", "x.tar.gz"]).prefix).toBe(defaultServerPrefix());
    expect(parseUpgradeCliOptions(["--from", "x.tar.gz", "--prefix", "/srv/p"]).prefix).toBe(
      "/srv/p",
    );
  });
});
