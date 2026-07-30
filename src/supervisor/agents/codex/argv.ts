import { dirname as posixDirname } from "node:path/posix";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import type { ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import type { AppControlsMcpHttpConfig } from "@/supervisor/agents/appControlsMcp";
import type { McpServer, ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";
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
import { buildCodexBrowserMcpArgs, buildCodexBrowserMcpEnv } from "./mcpBrowser";
import { buildCodexSubagentMcpArgs, buildCodexSubagentMcpEnv } from "./mcpSubagent";
import { resolveCodexWindowsLaunchBinary } from "./windowsExecutable";
import { buildCodexComputerUseMcpArgs, buildCodexComputerUseMcpEnv } from "./mcpComputerUse";
import { buildCodexChromeMcpArgs, buildCodexChromeMcpEnv } from "./mcpChrome";
import { buildCodexAppControlsMcpArgs, buildCodexAppControlsMcpEnv } from "./mcpAppControls";
import { buildCodexUserMcp } from "../userMcp";

const CODEX_GOALS_FEATURE_FLAG = "goals";
const codexGoalsSupportCache = new Map<string, boolean>();

interface BuildCodexArgsOptions {
  config: ThreadConfig;
  prompt: string;
  enableGoals: boolean;
  launchOptions?: AgentLaunchOptions;
  location?: ProjectLocation;
  userMcpArgs?: string[];
}

function buildCodexArgs(opts: BuildCodexArgsOptions): string[] {
  const { config, prompt, enableGoals, launchOptions, location, userMcpArgs } = opts;
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

  if (location) {
    args.push(...(userMcpArgs ?? []));
    args.push(
      ...buildCodexBrowserMcpArgs(location, config.browserMcp === true, launchOptions?.browserMcp),
      ...buildCodexComputerUseMcpArgs(
        location,
        config.computerUse === true,
        launchOptions?.computerUseMcp,
      ),
      ...buildCodexChromeMcpArgs(location, config.chromeMcp === true, launchOptions?.chromeMcp),
      // App controls has no per-thread config flag; the spawn pipeline
      // withholds the http config when the server is hard-disabled.
      ...(launchOptions?.appControlsMcp
        ? buildCodexAppControlsMcpArgs(location, launchOptions.appControlsMcp)
        : []),
    );
    args.push(
      ...buildCodexSubagentMcpArgs(config.subagentMcp === true, launchOptions?.subagentMcp),
    );
  }

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
  profileEnv?: Record<string, string>,
): AgentArgvSpec {
  const binary = resolveCodexWindowsLaunchBinary(location) ?? "codex";
  const userMcp = buildCodexUserMcp(launchOptions?.mcpServers ?? []);
  const mcpEnv = {
    ...userMcp.env,
    ...buildCodexBrowserMcpEnv(launchOptions?.browserMcp),
    ...buildCodexSubagentMcpEnv(launchOptions?.subagentMcp),
    ...buildCodexComputerUseMcpEnv(launchOptions?.computerUseMcp),
    ...buildCodexChromeMcpEnv(launchOptions?.chromeMcp),
    ...buildCodexAppControlsMcpEnv(launchOptions?.appControlsMcp),
  };
  const env = { ...profileEnv, ...mcpEnv };
  const hasEnv = Object.keys(env).length > 0;
  const enableGoals = isCodexGoalsSupported(location);
  const baseArgsOptions: BuildCodexArgsOptions = {
    config,
    prompt: "",
    enableGoals,
    ...(launchOptions ? { launchOptions } : {}),
    location,
    userMcpArgs: userMcp.args,
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
      ...(hasEnv ? { env } : {}),
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
    ...(hasEnv ? { env } : {}),
  };
}

export function buildCodexAppServerCommand(
  location: ProjectLocation,
  options?: {
    wslExecPath?: string;
    wslNodePath?: string;
    browserMcpEnabled?: boolean;
    browserMcp?: BrowserMcpHttpConfig;
    subagentMcpEnabled?: boolean;
    subagentMcp?: SubagentMcpHttpConfig;
    computerUseMcpEnabled?: boolean;
    computerUseMcp?: ComputerUseMcpHttpConfig;
    chromeMcpEnabled?: boolean;
    chromeMcp?: ChromeMcpHttpConfig;
    appControlsMcp?: AppControlsMcpHttpConfig;
    mcpServers?: McpServer[];
    env?: Record<string, string>;
  },
): CommandSpec {
  const wslExecPath = options?.wslExecPath;
  const wslNodePath = options?.wslNodePath;
  const userMcp = buildCodexUserMcp(options?.mcpServers ?? []);
  const browserMcpArgs = buildCodexBrowserMcpArgs(
    location,
    options?.browserMcpEnabled === true,
    options?.browserMcp,
  );
  const subagentMcpArgs = buildCodexSubagentMcpArgs(
    options?.subagentMcpEnabled === true,
    options?.subagentMcp,
  );
  const computerUseMcpArgs = buildCodexComputerUseMcpArgs(
    location,
    options?.computerUseMcpEnabled === true,
    options?.computerUseMcp,
  );
  const chromeMcpArgs = buildCodexChromeMcpArgs(
    location,
    options?.chromeMcpEnabled === true,
    options?.chromeMcp,
  );
  const appControlsMcpArgs = options?.appControlsMcp
    ? buildCodexAppControlsMcpArgs(location, options.appControlsMcp)
    : [];
  const mcpEnv = {
    ...userMcp.env,
    ...buildCodexBrowserMcpEnv(options?.browserMcp),
    ...buildCodexSubagentMcpEnv(options?.subagentMcp),
    ...buildCodexComputerUseMcpEnv(options?.computerUseMcp),
    ...buildCodexChromeMcpEnv(options?.chromeMcp),
    ...buildCodexAppControlsMcpEnv(options?.appControlsMcp),
  };
  const env = { ...options?.env, ...mcpEnv };
  const hasEnv = Object.keys(env).length > 0;
  const args = [
    ...(isCodexGoalsSupported(location, wslExecPath) ? ["--enable", CODEX_GOALS_FEATURE_FLAG] : []),
    ...userMcp.args,
    ...browserMcpArgs,
    ...subagentMcpArgs,
    ...computerUseMcpArgs,
    ...chromeMcpArgs,
    ...appControlsMcpArgs,
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
        ...(hasEnv ? Object.entries(env).map(([name, value]) => `${name}=${value}`) : []),
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
    hasEnv ? env : undefined,
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
