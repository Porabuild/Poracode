import { describe, expect, it } from "vitest";
import { buildPosixExportPrefix } from "./shellBasics";

describe("buildPosixExportPrefix", () => {
  it("returns empty string for undefined or empty env", () => {
    expect(buildPosixExportPrefix(undefined)).toBe("");
    expect(buildPosixExportPrefix({})).toBe("");
  });

  it("single-quotes values to neutralize shell metacharacters", () => {
    const prefix = buildPosixExportPrefix({ TERM: "xterm; rm -rf ~" });
    expect(prefix).toBe("export TERM='xterm; rm -rf ~'; ");
  });

  it("escapes embedded single quotes in values", () => {
    const prefix = buildPosixExportPrefix({ X: "a'b" });
    expect(prefix).toBe("export X='a'\\''b'; ");
  });

  it("joins multiple entries with semicolons", () => {
    const prefix = buildPosixExportPrefix({ A: "1", B: "2" });
    expect(prefix).toBe("export A='1'; export B='2'; ");
  });

  it("skips keys that are not valid POSIX env names (injection guard)", () => {
    // A malicious key would otherwise break out of the `export` statement,
    // because the key is interpolated raw (only the value is quoted).
    const prefix = buildPosixExportPrefix({
      "x; rm -rf ~ #": "value",
      SAFE: "ok",
    });
    expect(prefix).toBe("export SAFE='ok'; ");
    expect(prefix).not.toContain("rm -rf");
  });

  it("returns empty string when every key is invalid", () => {
    expect(buildPosixExportPrefix({ "1bad": "v", "has space": "v" })).toBe("");
  });

  it("accepts conventional env names including underscores and digits", () => {
    const prefix = buildPosixExportPrefix({ _FOO: "1", BAR_2: "2", COLORTERM: "3" });
    expect(prefix).toBe("export _FOO='1'; export BAR_2='2'; export COLORTERM='3'; ");
  });
});
