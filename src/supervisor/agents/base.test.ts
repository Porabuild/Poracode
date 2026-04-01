import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "../../shared/contracts";
import { buildBatchWslScript, getWslCommand, wrapWslCommand } from "./base";

const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
};

describe("buildBatchWslScript", () => {
  it("separates commands with newlines so bash executes each batch item cleanly", () => {
    expect(buildBatchWslScript(["which codex", "codex --version"], "__SEP__")).toBe(
      '(which codex) 2>/dev/null; echo "__SEP__"\n(codex --version) 2>/dev/null; echo "__SEP__"',
    );
  });
});

describe.skipIf(process.platform !== "win32")("wrapWslCommand", () => {
  it("launches WSL agent commands directly instead of forcing bash", () => {
    expect(wrapWslCommand(wslProject, "codex", ["--version"])).toEqual({
      command: getWslCommand(),
      args: [
        "-d",
        "Ubuntu",
        "--cd",
        "/home/demo/project",
        "--",
        "/bin/bash",
        "-l",
        "-i",
        "-c",
        "exec 'codex' '--version'",
      ],
    });
  });

  it("uses the detected executable path inside a login shell when available", () => {
    expect(
      wrapWslCommand(
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
        "--",
        "/bin/bash",
        "-l",
        "-i",
        "-c",
        "exec '/home/demo/.nvm/versions/node/v24/bin/codex' 'resume' 'session-1'",
      ],
    });
  });
});
