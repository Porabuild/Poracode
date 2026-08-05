import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { getWslCommand, injectWslEnv, buildAgentCommand } from "./base";

const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
};

describe.skipIf(process.platform !== "win32")("buildAgentCommand", () => {
  it("launches WSL agent commands through the resolved login shell", () => {
    expect(buildAgentCommand(wslProject, "codex", ["--version"])).toEqual({
      command: getWslCommand(),
      args: [
        "-d",
        "Ubuntu",
        "--cd",
        "/home/demo/project",
        "--exec",
        expect.any(String),
        "-l",
        "-i",
        "-c",
        "exec 'codex' '--version'",
      ],
    });
  });

  it("uses the detected executable path inside a login shell when available", () => {
    expect(
      buildAgentCommand(
        wslProject,
        "codex",
        ["resume", "session-1"],
        "/home/demo/.nvm/versions/node/v24/bin/codex",
      ),
    ).toEqual({
      command: getWslCommand(),
      args: [
        "-d",
        "Ubuntu",
        "--cd",
        "/home/demo/project",
        "--exec",
        expect.any(String),
        "-l",
        "-i",
        "-c",
        "exec '/home/demo/.nvm/versions/node/v24/bin/codex' 'resume' 'session-1'",
      ],
    });
  });

  it("bakes env vars into the WSL shell script as exports", () => {
    const spec = buildAgentCommand(wslProject, "claude", ["--print"], undefined, {
      CLAUDE_CODE_NO_FLICKER: "1",
    });
    const script = spec.args[spec.args.length - 1]!;
    expect(script).toBe("export CLAUDE_CODE_NO_FLICKER='1'; exec 'claude' '--print'");
  });
});

describe("injectWslEnv", () => {
  it("prepends export statements to the WSL script arg", () => {
    const original = buildAgentCommand(wslProject, "claude", ["--version"]);
    const patched = injectWslEnv(original, wslProject, {
      CLAUDE_CODE_NO_FLICKER: "1",
      ANOTHER_VAR: "hello",
    });

    // Original is unchanged
    expect(original.args[original.args.length - 1]).toBe("exec 'claude' '--version'");

    const script = patched.args[patched.args.length - 1]!;
    expect(script).toContain("export CLAUDE_CODE_NO_FLICKER='1'");
    expect(script).toContain("export ANOTHER_VAR='hello'");
    expect(script).toContain("exec 'claude' '--version'");
  });

  it("returns the spec unchanged for non-WSL locations", () => {
    const windowsProject: ProjectLocation = { kind: "windows", path: "C:\\project" };
    const original = { command: "claude", args: ["--version"] };
    const result = injectWslEnv(original, windowsProject, { FOO: "1" });
    expect(result).toBe(original);
  });

  it("returns the spec unchanged when env is empty", () => {
    const original = buildAgentCommand(wslProject, "claude", ["--version"]);
    const result = injectWslEnv(original, wslProject, {});
    expect(result).toBe(original);
  });
});
