import { randomUUID } from "node:crypto";

import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  PromptSegment,
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
  shortenHomePath,
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
  bypassApprovalPolicy: "bypassPermissions",
  settingDefs: [
    {
      key: "usePowershellTool",
      envVar: "CLAUDE_CODE_USE_POWERSHELL_TOOL",
      label: "Use PowerShell tool",
      description: "Use PowerShell as the shell tool instead of Bash.",
      default: process.platform === "win32",
      platforms: ["win32"],
    },
    {
      key: "noFlicker",
      envVar: "CLAUDE_CODE_NO_FLICKER",
      label: "No flicker mode",
      description: "Reduces terminal flicker in the Claude Code TUI.",
      default: true,
    },
  ],
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
  let next: ThreadConfig | undefined;

  // ── Plan mode transitions ──────────────────────────────
  if (input.hint.planMode && input.config.mode !== "plan") {
    // Enter plan mode when the TUI shows "plan mode on" but our config doesn't reflect it.
    next = { ...(next ?? input.config), mode: "plan" };
  } else if (
    !input.hint.planMode &&
    input.config.mode === "plan" &&
    (input.hint.status === "idle" ||
      (input.hint.status === "working" &&
        (input.previousStatus === "needs_reply" || input.previousStatus === "needs_approval")))
  ) {
    // Exit plan mode: TUI no longer shows "plan mode on" while config still has mode=plan.
    next = { ...(next ?? input.config), mode: undefined };
  }

  // ── Approval policy ───────────────────────────────────
  if (input.hint.approvalPolicy !== undefined) {
    const currentPolicy = input.config.approvalPolicy ?? "default";
    if (input.hint.approvalPolicy !== currentPolicy) {
      next = { ...(next ?? input.config), approvalPolicy: input.hint.approvalPolicy };
    }
  }

  // ── Model ─────────────────────────────────────────────
  if (input.hint.model !== undefined && input.hint.model !== input.config.model) {
    next = { ...(next ?? input.config), model: input.hint.model };
  }

  // ── Effort ────────────────────────────────────────────
  if (input.hint.effort !== undefined && input.hint.effort !== input.config.effort) {
    next = { ...(next ?? input.config), effort: input.hint.effort };
  }

  return next;
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
    buildDirectInput(prompt, segments) {
      const attachmentCount = segments?.filter((s) => s.kind === "attachment").length ?? 0;
      const wait = attachmentCount > 0 ? 500 + (attachmentCount - 1) * 100 : 60;
      return [prompt, `@wait:${wait}`, "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      // Claude CLI natively handles @path for files and images — pass as @path inline.
      // Attachments are appended so the text prompt leads (better for title generation).
      // Shorten absolute home-dir paths to ~/... for a cleaner prompt line.
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${shortenHomePath(s.path)}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
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
  approvalPolicy?: string;
  /**
   * Whether this pattern alone is a strong (self-corroborating) signal.
   * Strong patterns are specific multi-word phrases unlikely to appear
   * during transient TUI redraws. Weak patterns (prompt cursor, spinner)
   * need a second independent signal to be corroborated.
   */
  strong?: boolean;
};

const CLAUDE_HINTS: HintEntry[] = [
  {
    re: /Esc to cancel\s.*Tab to amend/i,
    status: "needs_approval",
    attention: "needs_approval",
    strong: true,
  },
  { re: /Enter to select/i, status: "needs_reply", attention: "needs_reply", strong: true },
  { re: /esc to interrupt/i, status: "working", attention: "working", strong: true },
  // Animated spinner (✻✶✽✢⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) + text + ellipsis — universal working indicator
  // NOTE: plain `*` excluded — Claude Code uses `*` as a selection marker in menus
  // Weak: spinners can linger as stale artifacts in the rolling buffer.
  { re: /[✻✶✽✢⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+\S.*(?:…|\.\.\.)/i, status: "working", attention: "working" },
  // Plan approval prompt — "shift+tab to approve" / "ctrl-g to edit in Vim · <plan path>"
  { re: /shift.tab to approve/i, status: "needs_reply", attention: "needs_reply", strong: true },
  { re: /ctrl-g to edit/i, status: "needs_reply", attention: "needs_reply", strong: true },
  // "Exit plan mode?" confirmation — match the ❯ cursor on numbered choice at the end
  { re: /exit plan mode\?/i, status: "needs_reply", attention: "needs_reply", strong: true },
  { re: /\?\s+for shortcuts/i, status: "idle", attention: "none", approvalPolicy: "default", strong: true },
  { re: /plan mode on/i, status: "idle", attention: "none", planMode: true, strong: true },
  { re: /accept edits/i, status: "idle", attention: "none", approvalPolicy: "acceptEdits", strong: true },
  { re: /bypass permissions/i, status: "idle", attention: "none", approvalPolicy: "bypassPermissions", strong: true },
  // ❯ or > prompt cursor — universal idle/ready indicator
  // Exclude ❯ followed by a digit (numbered selection menu, not the input prompt)
  // Weak: can flash during partial TUI redraws.
  { re: /❯(?!\s*\d)|^\s*>(?!\s*\d)/, status: "idle", attention: "none" },
  // Type your message — idle indicator (fallback)
  // Weak: generic text that could appear in agent output.
  { re: /type your message/i, status: "idle", attention: "none" },
];

export function detectClaudeTerminalStatus(text: string): TerminalStatusHint | null {
  // Find whichever pattern appears closest to the end of the output —
  // the TUI status indicator at the bottom is the current state.
  // We need the LAST match of each pattern, not the first, because the
  // accumulated buffer can contain stale matches from earlier states.
  //
  // Weak patterns (prompt cursor, spinner) are restricted to the tail of
  // the buffer. Large screen repaints can include historical ❯ prompt
  // markers from previous user messages deep in the chat scrollback;
  // without the tail restriction these stale markers win the "last match"
  // contest and cause false idle detections while the agent is working.
  const WEAK_TAIL_WINDOW = 300;
  const weakStart = text.length > WEAK_TAIL_WINDOW ? text.length - WEAK_TAIL_WINDOW : 0;

  let best: { index: number; entry: HintEntry } | null = null;

  for (const entry of CLAUDE_HINTS) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
      // Weak patterns must match within the tail window to avoid
      // picking up stale artifacts from chat history.
      if (entry.strong || m.index >= weakStart) {
        last = m;
      }
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

  if (best.entry.approvalPolicy) {
    hint.approvalPolicy = best.entry.approvalPolicy;
  }

  // ── Dual-pattern corroboration ─────────────────────────────
  // Strong patterns are self-corroborating. Weak patterns need
  // a second independent signal of the same status in the buffer.
  if (best.entry.strong) {
    hint.corroborated = true;
  } else {
    // Check if any other strong entry of the same status is also present
    hint.corroborated = CLAUDE_HINTS.some(
      (entry) =>
        entry.strong && entry.status === best!.entry.status && entry !== best!.entry && entry.re.test(text),
    );
  }

  // Detect model/effort changes from "Set model to ..." messages
  const modelEffort = detectClaudeModelEffort(text);
  if (modelEffort?.model) hint.model = modelEffort.model;
  if (modelEffort?.effort) hint.effort = modelEffort.effort;

  return hint;
}

// ── Model / effort detection from "Set model to …" messages ─────────

const CLAUDE_MODEL_MAP: [RegExp, string][] = [
  [/opus/i, "claude-opus-4-6[1m]"],
  [/haiku/i, "haiku"],
  [/sonnet/i, "sonnet"],
];

const KNOWN_EFFORTS = new Set(["low", "medium", "high", "max"]);

export function detectClaudeModelEffort(
  text: string,
): { model?: string; effort?: string } | null {
  const re = /Set model to (.+?)(?:\s+with (\w+) effort)?\s*$/gm;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = m;
  }
  if (!last) return null;

  const rawModel = last[1]?.replace(/\s*\(default\)\s*$/, "").trim();
  const rawEffort = last[2]?.toLowerCase();

  let model: string | undefined;
  if (rawModel) {
    for (const [pattern, id] of CLAUDE_MODEL_MAP) {
      if (pattern.test(rawModel)) {
        model = id;
        break;
      }
    }
  }

  const effort = rawEffort && KNOWN_EFFORTS.has(rawEffort) ? rawEffort : undefined;

  if (!model && !effort) return null;
  const result: { model?: string; effort?: string } = {};
  if (model) result.model = model;
  if (effort) result.effort = effort;
  return result;
}
