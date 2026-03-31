import { randomUUID } from "node:crypto";
import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  ThreadConfig,
} from "../../shared/contracts";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  createKnownSessionRef,
  readCommandOutputAsync,
  readWslCommandOutputAsync,
  resolveExecutablePathAsync,
  resolveWslExecutablePath,
  type AgentEnvContext,
  type AgentAdapter,
  type SyncConfigFromTerminalStateInput,
  type TerminalStatusHint,
} from "./base";

const capabilities: AgentCapability = {
  models: [
    { id: "claude-opus-4-6[1m]", label: "Opus 1M" },
    { id: "sonnet", label: "Sonnet" },
    { id: "haiku", label: "Haiku" },
  ],
  efforts: ["low", "medium", "high", "max"],
  defaultEffort: "high",
  modelEfforts: {
    haiku: [],
    sonnet: ["low", "medium", "high"],
  },
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },

    { id: "acceptEdits", label: "Accept Edits" },
    { id: "dontAsk", label: "Don't Ask" },
    { id: "bypassPermissions", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
};

function buildClaudeArgs(
  config: ThreadConfig,
  prompt: string,
  sessionId?: string,
  assignedSessionId?: string,
): string[] {
  const args: string[] = [];

  if (sessionId) {
    args.push("--resume", sessionId);
  } else if (assignedSessionId) {
    args.push("--session-id", assignedSessionId);
  }

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.effort) {
    args.push("--effort", config.effort);
  }

  args.push("--allow-dangerously-skip-permissions");

  const permissionMode = config.mode === "plan" ? "plan" : (config.approvalPolicy ?? "default");
  args.push("--permission-mode", permissionMode);

  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

function syncClaudeConfigFromTerminalState(
  input: SyncConfigFromTerminalStateInput,
): ThreadConfig | undefined {
  const planModeExited =
    !input.hint.planMode &&
    input.config.mode === "plan" &&
    (input.hint.status === "idle" ||
      (input.hint.status === "working" &&
        (input.previousStatus === "needs_reply" || input.previousStatus === "needs_approval")));

  if (!planModeExited) {
    return undefined;
  }

  return { ...input.config, mode: undefined };
}

export function createClaudeAdapter(): AgentAdapter {
  const detectedWslExecPaths = new Map<string, string | undefined>();

  function resolveWslExecPath(location: ProjectLocation): string | undefined {
    if (location.kind !== "wsl") {
      return undefined;
    }

    const cached = detectedWslExecPaths.get(location.distro);
    if (cached) {
      return cached;
    }

    const resolved = resolveWslExecutablePath(location.distro, "claude");
    detectedWslExecPaths.set(location.distro, resolved);
    return resolved;
  }

  return {
    kind: "claude",
    label: "Claude Code",
    capabilities,
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult] = await batchWslCommandsAsync(ctx.wslDistro!, ["command -v claude"]);
        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const [versionResult, authResult] = await Promise.all([
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
            : undefined,
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["auth", "status"])
            : undefined,
        ]);
        return {
          kind: "claude",
          label: "Claude Code",
          installed: executablePath !== undefined,
          ...(executablePath ? { executablePath } : {}),
          ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
          authState: authResult?.ok ? "authenticated" : executablePath ? "unknown" : "missing",
          capabilities,
        };
      }

      const executablePath = await resolveExecutablePathAsync("claude");
      const [versionResult, authResult] = await Promise.all([
        executablePath ? readCommandOutputAsync("claude", ["--version"]) : undefined,
        executablePath ? readCommandOutputAsync("claude", ["auth", "status"]) : undefined,
      ]);
      const authState =
        authResult === undefined ? "missing" : authResult.ok ? "authenticated" : "unknown";

      return {
        kind: "claude",
        label: "Claude Code",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState,
        capabilities,
      };
    },
    buildLaunchCommand(location, config, prompt, _sessionRef, _launchOptions) {
      const assignedId = randomUUID();
      const args = buildClaudeArgs(config, prompt, undefined, assignedId);
      const spec = buildAgentCommand(location, "claude", args, resolveWslExecPath(location));
      spec.sessionRef = createKnownSessionRef(assignedId);
      return spec;
    },
    buildResumeCommand(location, config, prompt, sessionRef, _launchOptions) {
      const args = buildClaudeArgs(config, prompt, sessionRef.providerSessionId);
      return buildAgentCommand(location, "claude", args, resolveWslExecPath(location));
    },
    createInitialSessionRef() {
      return undefined;
    },
    buildDirectInput(prompt) {
      return [prompt, "\r"];
    },
    detectTerminalStatus: detectClaudeTerminalStatus,
    syncConfigFromTerminalState: syncClaudeConfigFromTerminalState,
    defaultOneShotModel: "haiku",
    buildOneShotCommand(model, effort) {
      const args = ["-p", "--model", model];
      if (effort) {
        args.push("--effort", effort);
      }
      return { command: "claude", args };
    },
  };
}

type HintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
  planMode?: boolean;
};

const CLAUDE_HINTS: HintEntry[] = [
  {
    re: /Esc to cancel\s.*Tab to amend/i,
    status: "needs_approval",
    attention: "needs_approval",
  },
  { re: /Enter to select/i, status: "needs_reply", attention: "needs_reply" },
  { re: /esc to interrupt/i, status: "working", attention: "working" },
  // Animated spinner (✻✶✽✢*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) + text + ellipsis — universal working indicator
  { re: /[✻✶✽✢*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+\S.*(?:…|\.\.\.)/i, status: "working", attention: "working" },
  // Plan approval prompt — "ctrl-g to edit in Vim · <plan path>"
  { re: /ctrl-g to edit/i, status: "needs_reply", attention: "needs_reply" },
  { re: /\?\s+for shortcuts/i, status: "idle", attention: "none" },
  { re: /plan mode on/i, status: "idle", attention: "none", planMode: true },
  // ❯ or > prompt cursor — universal idle/ready indicator
  { re: /❯|^\s*>/, status: "idle", attention: "none" },
  // Type your message — idle indicator (fallback)
  { re: /type your message/i, status: "idle", attention: "none" },
];

export function detectClaudeTerminalStatus(text: string): TerminalStatusHint | null {
  // Find whichever pattern appears closest to the end of the output —
  // the TUI status indicator at the bottom is the current state.
  // We need the LAST match of each pattern, not the first, because the
  // accumulated buffer can contain stale matches from earlier states.
  let best: { index: number; entry: HintEntry } | null = null;

  for (const entry of CLAUDE_HINTS) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
      last = m;
    }
    if (last && (best === null || last.index > best.index)) {
      best = { index: last.index, entry };
    }
  }

  if (!best) {
    return null;
  }

  const hint: TerminalStatusHint = {
    status: best.entry.status,
    attention: best.entry.attention,
  };

  if (best.entry.planMode) {
    hint.planMode = true;
  }

  return hint;
}
