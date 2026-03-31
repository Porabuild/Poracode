import { randomUUID } from "node:crypto";
import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  TerminalPrompt,
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
  hasPrompt: boolean;
  planMode?: boolean;
};

const CLAUDE_HINTS: HintEntry[] = [
  {
    re: /Esc to cancel\s.*Tab to amend/i,
    status: "needs_approval",
    attention: "needs_approval",
    hasPrompt: true,
  },
  { re: /Enter to select/i, status: "needs_reply", attention: "needs_reply", hasPrompt: true },
  { re: /esc to interrupt/i, status: "working", attention: "working", hasPrompt: false },
  // Animated spinner (✻✶✽✢*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) + text + ellipsis — universal working indicator
  { re: /[✻✶✽✢*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+\S.*(?:…|\.\.\.)/i, status: "working", attention: "working", hasPrompt: false },
  // Plan approval prompt — "ctrl-g to edit in Vim · <plan path>"
  { re: /ctrl-g to edit/i, status: "needs_reply", attention: "needs_reply", hasPrompt: true },
  { re: /\?\s+for shortcuts/i, status: "idle", attention: "none", hasPrompt: false },
  { re: /plan mode on/i, status: "idle", attention: "none", hasPrompt: false, planMode: true },
  // ❯ or > prompt cursor — universal idle/ready indicator
  { re: /❯|^\s*>/, status: "idle", attention: "none", hasPrompt: false },
  // Type your message — idle indicator (fallback)
  { re: /type your message/i, status: "idle", attention: "none", hasPrompt: false },
];

// Match numbered options: "1. Yes", "❯ 2. No", "> 3. Something"
const OPTION_RE = /^[\s❯>]*(\d+)\.\s+(.+)/;
const TEXT_INPUT_RE = /^type\s+(here|something)\b/i;
const SEPARATOR_RE = /^[\s\-_=~\u2500-\u257f]+$/u;
const SELECTED_ROW_RE = /^\s*(?:❯|>)(?:\s|$)/;
const FOOTER_HELP_RE = /^(Enter to select|Esc to cancel|ctrl-g to edit)\b/i;
const NOTES_RE = /^Notes:/i;
const PREVIEW_SUFFIX_RE = /\s{2,}[┌│└].*$/u;

type ParsedPromptOption = {
  explicitKey?: string;
  label: string;
  description?: string;
  isTextInput?: true;
  selected: boolean;
};

function cleanClaudePromptLine(raw: string): string {
  return raw.replace(/\u00a0/g, " ").replace(PREVIEW_SUFFIX_RE, "").trimEnd();
}

function stripSelectedRowMarker(value: string): string {
  return value.replace(/^\s*(?:❯|>)\s+/, "");
}

function buildFooterSubmitInput(delta: number): string {
  if (delta === 0) {
    return "\r";
  }
  const arrow = delta < 0 ? "\x1b[A" : "\x1b[B";
  return `${arrow.repeat(Math.abs(delta))}\r`;
}

function buildPromptOptions(options: ParsedPromptOption[]): TerminalPrompt["options"] {
  const selectedIndex = options.findIndex((option) => option.selected);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;

  return options.map((option, index) => {
    const key = option.explicitKey ?? String(index + 1);
    return {
      key,
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
      ...(option.isTextInput ? { isTextInput: true } : {}),
      ...(option.explicitKey ? {} : { submitInput: buildFooterSubmitInput(index - currentIndex) }),
    };
  });
}

function parseTerminalPrompt(text: string): TerminalPrompt | undefined {
  const lines = text.split("\n").map(cleanClaudePromptLine);

  // Require a known prompt indicator (footer help text) to avoid false positives
  // from startup output or other numbered lists that aren't interactive prompts.
  const hasPromptIndicator =
    FOOTER_HELP_RE.test(text) || /Esc to cancel|Tab to amend|Enter to select|ctrl-g to edit/i.test(text);

  if (!hasPromptIndicator) {
    return undefined;
  }

  // Track the most recent logical block of numbered options.
  // Non-option content starts a new group, but decorative divider rows
  // are ignored so Claude menus that are visually split still surface
  // as one prompt in the composer. Only the LAST real group in the
  // buffer is returned, which discards stale numbered items above it.
  let currentOptions: ParsedPromptOption[] = [];
  let currentTitle = "";
  let lastOptions: ParsedPromptOption[] = [];
  let lastTitle = "";
  let separatorAfterOptions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const optMatch = OPTION_RE.exec(line);
    if (optMatch) {
      const label = optMatch[2]!.trim();

      // Collect indented continuation lines as description
      const descParts: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!;
        if (OPTION_RE.test(next) || next.trim().length === 0) break;
        if (FOOTER_HELP_RE.test(next.trim()) || NOTES_RE.test(next.trim())) break;
        if (/^\s{4,}/.test(next) && !SEPARATOR_RE.test(next.trim())) {
          descParts.push(next.trim());
          i++;
        } else {
          break;
        }
      }
      const description = descParts.length > 0 ? descParts.join(" ") : undefined;

      currentOptions.push({
        explicitKey: optMatch[1]!,
        label,
        ...(description ? { description } : {}),
        ...(TEXT_INPUT_RE.test(label) ? { isTextInput: true as const } : {}),
        selected: SELECTED_ROW_RE.test(line),
      });
      separatorAfterOptions = false;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (SEPARATOR_RE.test(trimmed)) {
      if (currentOptions.length > 0) {
        separatorAfterOptions = true;
      }
      continue;
    }
    if (FOOTER_HELP_RE.test(trimmed) || NOTES_RE.test(trimmed)) {
      continue;
    }
    if (currentOptions.length > 0 && separatorAfterOptions) {
      currentOptions.push({
        label: stripSelectedRowMarker(trimmed),
        selected: SELECTED_ROW_RE.test(line),
      });
      continue;
    }

    if (currentOptions.length > 0) {
      // Save completed group and start fresh
      lastOptions = currentOptions;
      lastTitle = currentTitle;
      currentOptions = [];
      separatorAfterOptions = false;
    }
    currentTitle = trimmed;
  }

  const options = currentOptions.length > 0 ? currentOptions : lastOptions;
  const title = currentOptions.length > 0 ? currentTitle : lastTitle;

  if (options.length === 0) {
    return undefined;
  }

  return { title, options: buildPromptOptions(options) };
}

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

  if (best.entry.hasPrompt) {
    hint.prompt = parseTerminalPrompt(text);
  }

  if (best.entry.planMode) {
    hint.planMode = true;
  }

  return hint;
}
