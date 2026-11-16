import { realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import * as base from "../base";
import {
  buildPowerShellInvocationScript,
  clearExecutablePathCache,
  getWslCommand,
  primeWslLaunchEnvironment,
  type DetectedPowerShell,
} from "../base";
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

const fishPath = ["/opt/homebrew/bin/fish", "/usr/bin/fish", "/usr/local/bin/fish"].find(
  existsSync,
);

it.skipIf(!fishPath)("preserves script backslashes and quotes through real fish", () => {
  const literal = String.raw`{"path":"C:\\Users\\demo","regex":"\\d+"}`;
  const command = `cat <<'EOF'\n${literal}\nEOF\nprintf '%s' 'ends in slash\\'`;
  const launch = buildAcpTerminalLaunch(
    { kind: "posix", path: process.cwd() },
    process.cwd(),
    command,
    [],
    {},
  );
  // Test the exact script handed to the login shell, without user config.
  const result = spawnSync(fishPath!, ["--no-config", "-c", launch.args.at(-1)!], {
    encoding: "utf8",
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(`${literal}\nends in slash\\`);
});

it("keeps shell-line syntax out of the user's login shell", () => {
  const shell = process.env.SHELL;
  process.env.SHELL = "/usr/bin/fish";
  try {
    const command = "cat <<'EOF'\n$HOME `ignored` $(ignored)\nEOF";
    const launch = buildAcpTerminalLaunch(
      { kind: "posix", path: "/project" },
      "/project/subdir",
      command,
      [],
      { ACP_TEST: "request value" },
    );
    expect(launch.command).toBe("/usr/bin/fish");
    expect(launch.args.at(-1)).toBe(
      "exec /bin/bash -c 'cat <<'\\''EOF'\\''\n$HOME `ignored` $(ignored)\nEOF'",
    );
    expect(launch.cwd).toBe("/project/subdir");
    expect(launch.env.ACP_TEST).toBe("request value");
    const direct = buildAcpTerminalLaunch(
      { kind: "posix", path: "/project" },
      "/project/subdir",
      "/usr/bin/fish",
      ["-c", "echo explicitly selected shell"],
      {},
    );
    expect(direct.command).toBe("/usr/bin/fish");
    expect(direct.args).toEqual(["-c", "echo explicitly selected shell"]);
  } finally {
    if (shell === undefined) delete process.env.SHELL;
    else process.env.SHELL = shell;
  }
});

it("uses Bash for WSL shell lines even when the distro's login shell is fish", () => {
  primeWslLaunchEnvironment("AcpFishFixture", { shellPath: "/usr/bin/fish", home: "/home/demo" });
  const launch = buildAcpTerminalLaunch(
    { ...wslProject, distro: "AcpFishFixture" },
    "/home/demo/project",
    "cat <<'EOF'\nheredoc\nEOF",
    [],
    { ACP_TEST: "it's literal" },
  );
  expect(launch.args).toEqual([
    "-d",
    "AcpFishFixture",
    "--cd",
    "/home/demo/project",
    "--exec",
    "/usr/bin/fish",
    "-l",
    "-i",
    "-c",
    "export TERM='xterm-256color'; export ACP_TEST='it'\\''s literal'; exec /bin/bash -c 'cat <<'\\''EOF'\\''\nheredoc\nEOF'",
  ]);
});

it.each([
  {
    name: "shell-line",
    command: "Write-Output ok # trailing comment",
    args: [],
  },
  {
    name: "native args",
    command: "node",
    args: ["-e", "process.exit(3)"],
  },
])("appends native exit-code propagation after the Windows $name body", ({ command, args }) => {
  const shell: DetectedPowerShell = { path: "pwsh.exe", kind: "pwsh" };
  const shellSpy = vi.spyOn(base, "detectShell").mockReturnValue(shell);
  try {
    const launch = buildAcpTerminalLaunch(
      { kind: "windows", path: "C:\\fixture\\project" },
      "C:\\fixture\\project",
      command,
      args,
      {},
    );
    const encoded = launch.args[launch.args.indexOf("-EncodedCommand") + 1]!;
    const script = Buffer.from(encoded, "base64").toString("utf16le");
    const body =
      args.length === 0
        ? `$ErrorActionPreference = 'Stop'; ${command}`
        : buildPowerShellInvocationScript(shell, command, args);

    expect(script).toBe(
      `${body}\nif (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }`,
    );
  } finally {
    shellSpy.mockRestore();
  }
});

describe.skipIf(process.platform !== "win32")("buildAcpTerminalLaunch", () => {
  afterEach(() => clearExecutablePathCache());

  it("uses the shared WSL login-shell command without default-shell reparsing", () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/demo" });
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
