import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { claudeSdkPermissionArgs, spawnClaudeInWsl } from "./sdkSpawn";

const state = vi.hoisted(() => ({
  spawn: vi.fn<(...args: unknown[]) => object>().mockReturnValue({}),
  shellEnv: vi.fn<() => Record<string, string>>(),
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: state.spawn,
}));
vi.mock("../base", async (original) => ({
  ...(await original<typeof import("../base")>()),
  getWslCommand: () => "wsl.exe",
  getWslProjectShellEnv: state.shellEnv,
}));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/fixture/claude" }));
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

const allowBypass = "--allow-dangerously-skip-permissions";

it.each([
  [0, false, false],
  [0, true, true],
  [1000, false, true],
  [undefined, false, true],
] as const)("keeps ordinary startup valid for uid %s (sandboxed: %s)", (uid, sandboxed, allow) => {
  const args = ["--permission-mode", "default", allowBypass, "--chrome"];
  expect(claudeSdkPermissionArgs(args, uid, sandboxed)).toEqual([
    "--permission-mode",
    "default",
    ...(allow ? [allowBypass] : []),
    "--chrome",
  ]);
});

it.each([
  ["--permission-mode=bypassPermissions", allowBypass],
  ["--permission-mode", "bypassPermissions", allowBypass],
  ["--dangerously-skip-permissions", allowBypass],
])("lets the CLI enforce its own root restriction on an explicit Bypass launch (%j)", (...args) => {
  expect(claudeSdkPermissionArgs(args, 0, false)).toEqual(args);
});

it.skipIf(process.platform === "win32").each([
  [0, {}, false],
  [0, { IS_SANDBOX: "1" }, true],
  [0, { CLAUDE_CODE_BUBBLEWRAP: "1" }, true],
  [0, { CLAUDE_CODE_BUBBLEWRAP: "" }, false],
  [1000, {}, true],
] as const)("checks WSL uid %s in the distro shell (env: %j)", (uid, env, allow) => {
  const directory = mkdtempSync(join(tmpdir(), "claude-wsl-permissions-"));
  directories.push(directory);
  writeFileSync(join(directory, "id"), `#!/bin/sh\nprintf '%s\\n' '${uid}'\n`, { mode: 0o700 });
  state.shellEnv.mockReturnValue({ PATH: directory });
  const value = "argument with spaces and 'quotes'";
  spawnClaudeInWsl(
    {
      kind: "wsl",
      distro: "Fixture",
      linuxPath: "/fixture",
      uncPath: "\\\\wsl$\\Fixture\\fixture",
    },
    {
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
        "--",
        "--permission-mode",
        "default",
        allowBypass,
        value,
      ],
      cwd: "/fixture",
      env,
      signal: new AbortController().signal,
    },
  );
  const [command, args] = state.spawn.mock.calls[0]!;
  expect(command).toBe("wsl.exe");
  const shell = (args as string[]).slice(5);
  const output = execFileSync(shell[0]!, shell.slice(1), { encoding: "utf8", env: {} });
  expect(JSON.parse(output)).toEqual([
    "--permission-mode",
    "default",
    ...(allow ? [allowBypass] : []),
    value,
  ]);
});
