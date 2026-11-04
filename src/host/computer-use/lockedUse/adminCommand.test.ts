import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildAdminPromptArgs,
  buildInstallerShellCommand,
  mapInstallerFailure,
  quoteAppleScriptString,
  quoteShellArgument,
  readAdminPromptExitCode,
} from "./adminCommand";

describe("locked computer use admin command", () => {
  it("single-quotes shell arguments so the shell reads them back verbatim", () => {
    const hostile = `/Applications/Pora code's "App".app/$(touch pwned)\`id\`;rm -rf ~ \\`;
    const quoted = quoteShellArgument(hostile);
    expect(quoted).toBe(
      `'/Applications/Pora code'\\''s "App".app/$(touch pwned)\`id\`;rm -rf ~ \\'`,
    );
    // printf echoes the single argument the shell parsed: no expansion happened.
    const echoed = spawnSync("/bin/sh", ["-c", `printf %s ${quoted}`], { encoding: "utf8" });
    expect(echoed.stdout).toBe(hostile);
    expect(() => quoteShellArgument("a\0b")).toThrow(/NUL/);
  });

  it("escapes AppleScript string literals", () => {
    expect(quoteAppleScriptString(`a "b" \\ c`)).toBe(`"a \\"b\\" \\\\ c"`);
  });

  it("builds install and uninstall commands with a numeric user id", () => {
    expect(buildInstallerShellCommand("/R/locked-computer-use-installer", "install", 501)).toBe(
      "'/R/locked-computer-use-installer' install --user 501",
    );
    expect(buildInstallerShellCommand("/R/installer", "uninstall", 501)).toBe(
      "'/R/installer' uninstall",
    );
    expect(() => buildInstallerShellCommand("/R/installer", "install", -1)).toThrow(
      /Invalid user id/,
    );
    expect(() => buildInstallerShellCommand("/R/installer", "install", 1.5)).toThrow(
      /Invalid user id/,
    );
  });

  it("wraps the command in exactly one administrator prompt", () => {
    const args = buildAdminPromptArgs(`/Apps/Pora "x"/installer`, "install", 501);
    expect(args).toEqual([
      "-e",
      `do shell script "'/Apps/Pora \\"x\\"/installer' install --user 501" with administrator privileges`,
    ]);
  });

  it("maps osascript exit reports to typed errors", () => {
    expect(readAdminPromptExitCode("0:91: execution error: User canceled. (-128)")).toBe(-128);
    expect(readAdminPromptExitCode("no number here")).toBeNull();
    expect(mapInstallerFailure("install", "execution error: User canceled. (-128)")).toBe(
      "cancelled",
    );
    expect(mapInstallerFailure("install", "execution error: usage (2)")).toBe("usage");
    expect(mapInstallerFailure("install", "execution error: rule (3)")).toBe("unsupported_rule");
    expect(mapInstallerFailure("install", "execution error: verify (4)")).toBe(
      "verification_failed",
    );
    expect(mapInstallerFailure("install", "execution error: root (5)")).toBe("not_root");
    expect(mapInstallerFailure("install", "execution error: missing (6)")).toBe("failed");
    expect(mapInstallerFailure("uninstall", "execution error: missing (6)")).toBeNull();
    expect(mapInstallerFailure("install", "execution error: boom (1)")).toBe("failed");
    expect(mapInstallerFailure("install", "")).toBe("failed");
  });
});
