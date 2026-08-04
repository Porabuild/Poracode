import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { getWslCommand } from "../base";
import { buildAcpTerminalLaunch } from "./sessionTerminalLaunch";

const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
};

describe.skipIf(process.platform !== "win32")("buildAcpTerminalLaunch", () => {
  it("uses the shared WSL login-shell command without default-shell reparsing", () => {
    const launch = buildAcpTerminalLaunch(
      wslProject,
      "/home/demo/project",
      "node",
      ["-p", "line1\nline2 `$(ignored)` 'single' \"double\""],
      {},
    );

    expect(launch.command).toBe(getWslCommand());
    expect(launch.args).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      "/home/demo/project",
      "--exec",
      expect.any(String),
      "-l",
      "-i",
      "-c",
      "export TERM='xterm-256color'; exec 'node' '-p' 'line1\nline2 `$(ignored)` '\\''single'\\'' \"double\"'",
    ]);
  });
});
