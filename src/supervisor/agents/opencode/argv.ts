import { homedir } from "node:os";
import { dirname as posixDirname } from "node:path/posix";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { buildAgentCommand, DEFAULT_WSL_EXEC_PATH, getWslCommand, type CommandSpec } from "../base";

// `opencode` (default TUI) only accepts `[project]` as a positional, so the
// initial prompt must go through `--prompt` rather than a trailing arg.
// `buildDirectInput` handles all subsequent prompts after the TUI is up.
export function buildOpenCodeArgs(
  config: ThreadConfig,
  prompt: string,
  resumeSessionId?: string,
): string[] {
  const args: string[] = [];

  if (resumeSessionId) {
    args.push("--session", resumeSessionId);
  }
  if (config.model) {
    args.push("--model", config.model);
  }
  // NOTE: `config.effort` (variant) is intentionally NOT forwarded here.
  // The opencode CLI (verified against 1.14.30) does not accept `--variant`;
  // passing it makes yargs abort with the help screen instead of starting the
  // TUI. The SDK `session.promptAsync({ variant })` path still applies it for
  // GUI threads; TUI launches fall back to the model default at session start.
  // Plan mode in the TUI is just the built-in `plan` agent (`opencode agent
  // list`). The default command accepts `--agent <name>` to pick it at
  // launch; the SDK runtime uses the same value via `prompt_async`.
  if (config.mode === "plan") {
    args.push("--agent", "plan");
  }
  if (prompt.trim().length > 0) {
    args.push("--prompt", prompt);
  }
  return args;
}

// Background `opencode serve` does not need rc init (no nvm/fnm shims to load),
// so we mirror Codex's `buildCodexAppServerCommand`: bypass `bash -l -i` and
// invoke the binary under `/usr/bin/env PATH=<segments>` instead. The TUI
// launch keeps its login-shell wrapping (via `buildAgentCommand` in the
// adapter's `buildLaunchArgv`). The pooled server starts from the runtime home,
// never the first acquired project; directory-scoped SDK requests select the
// actual project. Native Windows may also pass an already-resolved absolute
// executable path so packaged apps are not hostage to an ambient PATH.
export function buildOpenCodeServerCommand(
  location: ProjectLocation,
  resolvedExecPath?: string,
  env: Record<string, string> = {},
): CommandSpec {
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
        resolvedExecPath ?? "opencode",
        ...args,
      ],
    };
  }
  const runtimeLocation = { ...location, path: homedir() };
  return buildAgentCommand(runtimeLocation, "opencode", args, resolvedExecPath, env);
}
