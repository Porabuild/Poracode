import { dirname as posixDirname } from "node:path/posix";
import type {
  ProjectLocation,
  ResolvedMcpServer,
  SessionRef,
  ThreadConfig,
} from "@/shared/contracts";
import {
  buildAgentCommand,
  DEFAULT_WSL_EXEC_PATH,
  getWslCommand,
  type AgentArgvSpec,
  type AgentLaunchOptions,
  type CommandSpec,
} from "../base";
import {
  isCodexSemverSupportedForGoals,
  parseCodexVersionLine,
  probeCodexCliSemver,
} from "./plugin/install";
import { resolveCodexWindowsLaunchBinary } from "./windowsExecutable";
import { codexContextWindowOverrides } from "@/shared/agents/codexContextWindows";
import { buildCodexMcp } from "../userMcp";
import { buildCodexMcpSkillConflictArgs } from "./mcpSkillConflicts";

const CODEX_GOALS_FEATURE_FLAG = "goals";
const codexGoalsSupportCache = new Map<string, boolean>();

interface BuildCodexArgsOptions {
  config: ThreadConfig;
  prompt: string;
  enableGoals: boolean;
  launchOptions?: AgentLaunchOptions;
  mcpArgs?: string[];
}

function buildCodexArgs(opts: BuildCodexArgsOptions): string[] {
  const { config, prompt, enableGoals, launchOptions, mcpArgs } = opts;
  const args: string[] = [];

  if (enableGoals) {
    args.push("--enable", CODEX_GOALS_FEATURE_FLAG);
  }

  // OSC 9 TUI notifications — L2 status when hooks are unavailable (always-on).
  // `tui.notifications = true` enables all notification event types; array = allowlist only.
  args.push(
    "-c",
    "tui.notifications=true",
    "-c",
    'tui.notification_method="osc9"',
    "-c",
    "suppress_unstable_features_warning=true",
  );

  args.push(...(mcpArgs ?? []));

  if (!launchOptions?.suppressResumeConfigOverrides) {
    if (config.model) {
      args.push("-m", config.model);
    }
    if (config.effort) {
      args.push("-c", `model_reasoning_effort="${config.effort}"`);
    }
    if (config.fast) {
      // Codex's `service_tier="fast"` selects the priority lane on supported models.
      args.push("-c", 'service_tier="fast"');
    }
    const contextWindow = codexContextWindowOverrides(config.contextSize);
    args.push(
      "-c",
      `model_context_window=${contextWindow.model_context_window}`,
      "-c",
      `model_auto_compact_token_limit=${contextWindow.model_auto_compact_token_limit}`,
    );
    if (config.approvalPolicy) {
      args.push("-a", config.approvalPolicy);
    }
    if (config.approvalsReviewer) {
      args.push("-c", `approvals_reviewer="${config.approvalsReviewer}"`);
    }
    if (config.sandboxMode) {
      args.push("-s", config.sandboxMode);
    }
  }

  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

/**
 * Hook-launch flags must stay in the option section of the argv. Appending
 * them after positional session ids / prompts makes Codex treat
 * `--enable <hooks-feature>` as trailing user input instead of a real flag.
 */
export function codexExtraArgsPosition(
  args: string[],
  prompt: string,
  sessionRef?: SessionRef,
): number {
  let trailingPositionals = 0;
  if (args[0] === "resume" || sessionRef) {
    trailingPositionals += 1;
  }
  if (prompt.trim().length > 0) {
    trailingPositionals += 1;
  }
  return Math.max(args.length - trailingPositionals, args[0] === "resume" ? 1 : 0);
}

export function buildCodexArgvFor(
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionRef?: SessionRef,
  launchOptions?: AgentLaunchOptions,
): AgentArgvSpec {
  const binary = resolveCodexWindowsLaunchBinary(location) ?? "codex";
  const mcpServers = launchOptions?.mcpServers ?? [];
  const mcp = buildCodexMcp(mcpServers);
  const mcpArgs = [...buildCodexMcpSkillConflictArgs(location, mcpServers), ...mcp.args];
  const mcpEnv = mcp.env;
  const hasMcpEnv = Object.keys(mcpEnv).length > 0;
  const enableGoals = isCodexGoalsSupported(location);
  const baseArgsOptions: BuildCodexArgsOptions = {
    config,
    prompt: "",
    enableGoals,
    ...(launchOptions ? { launchOptions } : {}),
    mcpArgs,
  };
  // When the structured session owns thread lifecycle, the TUI resumes the
  // server-created thread. Config is controlled by the server, not the CLI.
  if (launchOptions?.suppressResumeConfigOverrides) {
    const baseArgs = buildCodexArgs(baseArgsOptions);
    const args = launchOptions.resumeThreadId
      ? [
          "resume",
          ...baseArgs,
          launchOptions.resumeThreadId,
          ...(prompt.trim().length > 0 ? [prompt] : []),
        ]
      : baseArgs;
    return {
      binary,
      args,
      ...(hasMcpEnv ? { env: mcpEnv } : {}),
    };
  }

  const codexArgs = buildCodexArgs({ ...baseArgsOptions, prompt });
  const args = sessionRef
    ? [
        "resume",
        ...buildCodexArgs(baseArgsOptions),
        sessionRef.providerSessionId,
        ...(prompt.trim().length > 0 ? [prompt] : []),
      ]
    : codexArgs;

  return {
    binary,
    args,
    ...(hasMcpEnv ? { env: mcpEnv } : {}),
  };
}

export function buildCodexAppServerCommand(
  location: ProjectLocation,
  options?: {
    wslExecPath?: string;
    wslNodePath?: string;
    mcpServers?: readonly ResolvedMcpServer[];
    includeMcpConfig?: boolean;
  },
): CommandSpec {
  const wslExecPath = options?.wslExecPath;
  const wslNodePath = options?.wslNodePath;
  const mcpServers = options?.mcpServers ?? [];
  const mcp = buildCodexMcp(mcpServers);
  const includeMcpConfig = options?.includeMcpConfig ?? true;
  const mcpSkillConflictArgs = buildCodexMcpSkillConflictArgs(location, mcpServers);
  const mcpEnv = mcp.env;
  const hasMcpEnv = Object.keys(mcpEnv).length > 0;
  const args = [
    ...(isCodexGoalsSupported(location, wslExecPath) ? ["--enable", CODEX_GOALS_FEATURE_FLAG] : []),
    ...mcpSkillConflictArgs,
    ...(includeMcpConfig ? mcp.args : []),
    "app-server",
  ];
  if (location.kind === "wsl") {
    const pathSegments = [
      wslNodePath ? posixDirname(wslNodePath) : undefined,
      wslExecPath?.startsWith("/") ? posixDirname(wslExecPath) : undefined,
      DEFAULT_WSL_EXEC_PATH,
    ].filter((segment): segment is string => Boolean(segment));
    return {
      command: getWslCommand(),
      args: [
        "-d",
        location.distro,
        "--cd",
        location.linuxPath,
        "--",
        "/usr/bin/env",
        `PATH=${pathSegments.join(":")}`,
        ...(hasMcpEnv ? Object.entries(mcpEnv).map(([name, value]) => `${name}=${value}`) : []),
        wslExecPath ?? "codex",
        ...args,
      ],
    };
  }
  return buildAgentCommand(
    location,
    "codex",
    args,
    resolveCodexWindowsLaunchBinary(location) ?? wslExecPath,
    hasMcpEnv ? mcpEnv : undefined,
  );
}

function isCodexGoalsSupported(location: ProjectLocation, executablePath?: string): boolean {
  if (location.kind === "wsl") {
    return codexGoalsSupportCache.get(codexGoalsSupportKey(location, executablePath)) ?? false;
  }

  const key = codexGoalsSupportKey(location, executablePath);
  const cached = codexGoalsSupportCache.get(key);
  if (cached !== undefined) return cached;

  const supported = isCodexSemverKnownSupportedForGoals(probeCodexCliSemver());
  codexGoalsSupportCache.set(key, supported);
  return supported;
}

export function primeCodexGoalsSupport(
  location: ProjectLocation,
  version: string | undefined,
  executablePath?: string,
): void {
  if (location.kind !== "wsl") return;
  const supported = version
    ? isCodexSemverSupportedForGoals(parseCodexVersionLine(version))
    : false;
  codexGoalsSupportCache.set(codexGoalsSupportKey(location, executablePath), supported);
}

function codexGoalsSupportKey(location: ProjectLocation, executablePath?: string): string {
  return location.kind === "wsl" ? `wsl:${location.distro}` : `native:${executablePath ?? ""}`;
}

function isCodexSemverKnownSupportedForGoals(v: [number, number, number] | null): boolean {
  return v === null ? true : isCodexSemverSupportedForGoals(v);
}
