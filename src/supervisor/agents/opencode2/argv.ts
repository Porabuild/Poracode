import { OPENCODE2_ENV } from "./binary";
import { homedir } from "node:os";
import { dirname as posixDirname } from "node:path/posix";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { buildAgentCommand, DEFAULT_WSL_EXEC_PATH, getWslCommand, type CommandSpec } from "../base";

// The opencode2 TUI (verified against 0.0.0-beta-19500) only accepts
// `--continue`, `--session`, `--prompt`, `--auto`, `--server`, and
// `--standalone` at launch. There is no `--model` and no `--agent` flag on the
// default command (both exist only on `opencode2 run`), so model, effort, and
// plan-mode selection are session-level concerns: the runtime persists them via
// the HTTP API before either GUI prompts or terminal attachment.
export function buildOpenCode2Args(
  config: ThreadConfig,
  prompt: string,
  resumeSessionId?: string,
): string[] {
  void config;
  const args: string[] = [];

  if (resumeSessionId) {
    args.push("--session", resumeSessionId);
  }
  if (prompt.trim().length > 0) {
    args.push("--prompt", prompt);
  }
  return args;
}

// Background `opencode2 serve` does not need rc init (no nvm/fnm shims to load),
// so we mirror Codex's `buildCodexAppServerCommand`: bypass `bash -l -i` and
// invoke the binary under `/usr/bin/env PATH=<segments>` instead. The TUI
// launch keeps its login-shell wrapping (via `buildAgentCommand` in the
// adapter's `buildLaunchArgv`). The pooled server starts from the runtime home,
// never the first acquired project; directory-scoped client requests select the
// actual project. Native Windows may also pass an already-resolved absolute
// executable path so packaged apps are not hostage to an ambient PATH.
export function buildOpenCode2ServerCommand(
  location: ProjectLocation,
  resolvedExecPath?: string,
  env: Record<string, string> = {},
): CommandSpec {
  env = { ...env, ...OPENCODE2_ENV };
  const args = ["serve", "--hostname=127.0.0.1", "--port=0", "--print-logs"];
  if (location.kind === "wsl") {
    const pathSegments = [
      resolvedExecPath?.startsWith("/") ? posixDirname(resolvedExecPath) : undefined,
      DEFAULT_WSL_EXEC_PATH,
    ].filter((segment): segment is string => Boolean(segment));
    return {
      command: getWslCommand(),
      args: [
        "-d",
        location.distro,
        "--cd",
        "~",
        "--",
        "/usr/bin/env",
        `PATH=${pathSegments.join(":")}`,
        ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
        resolvedExecPath ?? "opencode2",
        ...args,
      ],
    };
  }
  const runtimeLocation = { ...location, path: homedir() };
  return buildAgentCommand(runtimeLocation, "opencode2", args, resolvedExecPath, env);
}
