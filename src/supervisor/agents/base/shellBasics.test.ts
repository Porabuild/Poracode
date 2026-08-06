import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildPosixExportPrefix,
  buildWindowsCommandLine,
  quoteWindowsCommandLineArg,
} from "./shellBasics";

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

describe("quoteWindowsCommandLineArg", () => {
  it("leaves plain args unquoted", () => {
    expect(quoteWindowsCommandLineArg("--model")).toBe("--model");
    expect(quoteWindowsCommandLineArg("C:\\tools\\bin")).toBe("C:\\tools\\bin");
  });

  it("quotes empty args and args with whitespace", () => {
    expect(quoteWindowsCommandLineArg("")).toBe('""');
    expect(quoteWindowsCommandLineArg("two words")).toBe('"two words"');
  });

  it("escapes embedded quotes and doubles backslash runs before quotes", () => {
    expect(quoteWindowsCommandLineArg('say "hi"')).toBe('"say \\"hi\\""');
    expect(quoteWindowsCommandLineArg('back\\"slash')).toBe('"back\\\\\\"slash"');
    expect(quoteWindowsCommandLineArg("trailing slash\\ ")).toBe('"trailing slash\\ "');
    expect(quoteWindowsCommandLineArg("endswith\\")).toBe("endswith\\");
    expect(quoteWindowsCommandLineArg("ends with \\")).toBe('"ends with \\\\"');
  });

  it("keeps newlines inside the quoted region", () => {
    expect(quoteWindowsCommandLineArg("line1\nline2")).toBe('"line1\nline2"');
  });

  it.skipIf(process.platform !== "win32")(
    "round-trips hostile diff content through a real CRT parse",
    () => {
      const hostile = [
        'const x = $("div',
        'escaped \\" quote and trailing backslash \\',
        'single \' quote and "double" and !bang',
        "tabs\tand  double  spaces",
      ].join("\n");
      // windowsVerbatimArguments hands our pre-quoted command line to
      // CreateProcess untouched — exactly how ProcessStartInfo.Arguments is
      // consumed — so node's own CRT parser validates the quoting.
      const result = spawnSync(
        "node.exe",
        [buildWindowsCommandLine(["-e", "process.stdout.write(process.argv[1])", hostile])],
        { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(hostile);
    },
  );
});
