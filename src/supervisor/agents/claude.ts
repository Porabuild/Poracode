import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  SessionRef,
  ThreadConfig,
} from "../../shared/contracts";
import {
  createKnownSessionRef,
  readCommandOutput,
  resolveExecutablePath,
  wrapWslCommand,
  type AgentLaunchOptions,
  type AgentAdapter,
  type CommandSpec,
} from "./base";

const capabilities: AgentCapability = {
  models: ["sonnet", "opus", "claude-sonnet-4-6", "claude-opus-4-1"],
  efforts: ["low", "medium", "high", "max"],
  modes: ["agent", "plan"],
  approvalPolicies: ["default", "auto", "acceptEdits", "bypassPermissions", "dontAsk"],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
};

function resolveClaudePermissionMode(config: ThreadConfig): string {
  if (config.mode === "plan") {
    return "plan";
  }
  return config.approvalPolicy ?? "default";
}

function buildClaudeArgs(config: ThreadConfig, prompt: string, sessionId?: string): string[] {
  const args: string[] = [];

  if (sessionId) {
    args.push("--resume", sessionId);
  } else {
    throw new Error("Claude launch command requires a known session id.");
  }

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.effort) {
    args.push("--effort", config.effort);
  }

  args.push("--permission-mode", resolveClaudePermissionMode(config));
  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

function buildCommand(
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionRef?: SessionRef,
  _launchOptions?: AgentLaunchOptions,
): CommandSpec {
  const args = buildClaudeArgs(config, prompt, sessionRef?.providerSessionId);
  return wrapWslCommand(location, "claude", args);
}

export function createClaudeAdapter(): AgentAdapter {
  return {
    kind: "claude",
    label: "Claude Code CLI",
    capabilities,
    async detectInstall(): Promise<AgentStatus> {
      const executablePath = resolveExecutablePath("claude");
      const versionResult =
        executablePath === undefined ? undefined : readCommandOutput("claude", ["--version"]);
      const authResult =
        executablePath === undefined ? undefined : readCommandOutput("claude", ["auth", "status"]);

      const authState =
        authResult === undefined ? "missing" : authResult.ok ? "authenticated" : "unknown";

      return {
        kind: "claude",
        label: "Claude Code CLI",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState,
        capabilities,
      };
    },
    buildLaunchCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCommand(location, config, prompt, sessionRef, launchOptions);
    },
    buildResumeCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCommand(location, config, prompt, sessionRef, launchOptions);
    },
    createInitialSessionRef() {
      return createKnownSessionRef();
    },
    buildDirectInput(prompt) {
      return [...prompt, "\r"];
    },
  };
}
