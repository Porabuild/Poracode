import { realpath, stat } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { getWslCommand } from "../base";
import {
  buildAcpTerminalLaunch,
  resolveAcpTerminalCwd,
  validateAcpTerminalCwd,
} from "./sessionTerminalLaunch";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    realpath: vi.fn<(path: string) => Promise<string>>(async (path) => path),
    stat: vi.fn<() => Promise<{ isDirectory(): boolean }>>(async () => ({
      isDirectory: () => true,
    })),
  };
});

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

describe("resolveAcpTerminalCwd", () => {
  it("rejects a cwd outside a regular project", () => {
    expect(() => resolveAcpTerminalCwd(wslProject, "/tmp/elsewhere")).toThrow("Invalid params");
  });

  it("allows any cwd when the workspace is Home", () => {
    expect(
      resolveAcpTerminalCwd(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo",
        },
        "/tmp/elsewhere",
      ),
    ).toBe("/tmp/elsewhere");
    expect(
      resolveAcpTerminalCwd({ kind: "windows", path: "C:\\Users\\me" }, "E:\\work\\repo"),
    ).toBe("E:\\work\\repo");
  });
});

describe("terminal starting cwd with approved roots", () => {
  const primary: ProjectLocation = { kind: "posix", path: "/owned/primary" };
  const roots: ProjectLocation[] = [{ kind: "posix", path: "/owned/extra" }];
  it("accepts granted siblings and keeps default/relative cwd in primary", () => {
    expect(resolveAcpTerminalCwd(primary, "/owned/extra", roots)).toBe("/owned/extra");
    expect(resolveAcpTerminalCwd(primary, "/owned/primary", roots)).toBe("/owned/primary");
    expect(resolveAcpTerminalCwd(primary, "subdir", roots)).toBe("/owned/primary/subdir");
    for (const cwd of ["../denied", "/owned/extra-prefix", "/owned/extra/../denied"]) {
      expect(() => resolveAcpTerminalCwd(primary, cwd, roots)).toThrow("Invalid params");
    }
  });
  it("keeps WSL terminal cwd in agent Linux form", () => {
    const extra: ProjectLocation = {
      ...wslProject,
      linuxPath: "/work/extra",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\extra",
    };
    expect(resolveAcpTerminalCwd(wslProject, "/work/extra", [extra])).toBe("/work/extra");
  });
});

it("preflights a WSL terminal directory on its mapped host filesystem", async () => {
  const extra: ProjectLocation = {
    ...wslProject,
    linuxPath: "/work/extra",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\extra",
  };
  await validateAcpTerminalCwd(wslProject, "/work/extra", [extra]);
  expect(realpath).toHaveBeenCalledWith(extra.uncPath);
  expect(stat).toHaveBeenCalledWith(extra.uncPath);
  const drive: ProjectLocation = {
    ...wslProject,
    linuxPath: "/mnt/c/extra",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\extra",
  };
  await validateAcpTerminalCwd(wslProject, "/mnt/c/extra", [drive]);
  expect(realpath).toHaveBeenCalledWith("C:\\extra");
  expect(stat).toHaveBeenCalledWith("C:\\extra");
  await expect(
    validateAcpTerminalCwd(wslProject, "/home/demo/.agents/skills/test"),
  ).rejects.toMatchObject({ code: -32602 });
});
