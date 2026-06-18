import { compactAgentProviderMetadata, type AgentCapability } from "@/shared/contracts";
import { CLAUDE_EFFORT_TIERS } from "@/shared/agents/claudeEfforts";
import { readAgentCommandOutput, type DetectionSpec, type StatusProbeResult } from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import { probeClaudeCapabilities } from "./probe";

/** Default `--permission-mode` when `ThreadConfig.approvalPolicy` is omitted. */
export const CLAUDE_DEFAULT_APPROVAL_POLICY = "auto" as const;

/**
 * Shown on the disabled Fast toggle when the capabilities probe finds fast mode
 * is unavailable for the account. Mirrors Claude Code's own `/fast` wording.
 */
export const CLAUDE_FAST_MODE_DISABLED_MESSAGE = "Fast mode has been disabled by your organization";

const CLAUDE_BUILT_IN_SLASH_COMMANDS: AgentCapability["slashCommands"] = [
  {
    id: "goal",
    label: "goal — Set a goal — keep working until the condition is met",
    description: "Set a goal — keep working until the condition is met",
  },
];

/** Effort tiers shared by the frontier models (Opus 4.7/4.8 and Fable 5). */
const PREMIUM_EFFORT_TIERS: string[] = [...CLAUDE_EFFORT_TIERS];

/**
 * Master switch for the Fable 5 model. Flip to `true` to surface it again in the
 * model pickers — its effort/context/auto metadata is retained below so
 * re-enabling is a one-line change. While `false`, Fable 5 is hidden everywhere
 * (the leftover keyed entries are inert without a matching `models` row).
 */
const FABLE_5_ENABLED = false;

export const claudeCapabilities: AgentCapability = {
  models: [
    ...(FABLE_5_ENABLED ? [{ id: "claude-fable-5", label: "Fable 5" }] : []),
    { id: "claude-opus-4-8", label: "Opus 4.8" },
    { id: "claude-opus-4-7", label: "Opus 4.7" },
    { id: "claude-opus-4-6", label: "Opus 4.6" },
    { id: "sonnet", label: "Sonnet" },
    { id: "haiku", label: "Haiku" },
  ],
  efforts: PREMIUM_EFFORT_TIERS,
  defaultEffort: "high",
  modelEfforts: {
    "claude-fable-5": PREMIUM_EFFORT_TIERS,
    "claude-opus-4-8": PREMIUM_EFFORT_TIERS,
    "claude-opus-4-7": PREMIUM_EFFORT_TIERS,
    "claude-opus-4-6": ["low", "medium", "high", "max"],
    haiku: [],
    sonnet: ["low", "medium", "high", "max"],
  },
  contextSizes: [
    { id: "200k", label: "200k" },
    { id: "1m", label: "1M" },
  ],
  // Order matters: the first entry is the per-model default. Opus tiers default
  // to 1M (the long-context build users select these for); Sonnet defaults to
  // 200k because the 1M tier is billed per-token at premium rates.
  modelContextSizes: {
    "claude-fable-5": ["1m"],
    "claude-opus-4-8": ["1m", "200k"],
    "claude-opus-4-7": ["1m", "200k"],
    "claude-opus-4-6": ["1m", "200k"],
    sonnet: ["200k", "1m"],
  },
  defaultContextSize: "200k",
  fastModels: ["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6"],
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto", label: "Auto mode" },
    { id: "acceptEdits", label: "Accept Edits" },
    { id: "dontAsk", label: "Don't Ask" },
    { id: "bypassPermissions", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  slashCommands: CLAUDE_BUILT_IN_SLASH_COMMANDS,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: CLAUDE_DEFAULT_APPROVAL_POLICY,
  bypassPermissions: { approvalPolicy: CLAUDE_DEFAULT_APPROVAL_POLICY },
  settingDefs: [
    {
      key: "usePowershellTool",
      type: "toggle" as const,
      env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: "1" },
      label: "Use PowerShell tool",
      description: "Use PowerShell as the shell tool instead of Bash.",
      default: process.platform === "win32",
      platforms: ["win32"],
    },
    {
      key: "noFlicker",
      type: "toggle" as const,
      env: { CLAUDE_CODE_NO_FLICKER: "1" },
      label: "No flicker mode",
      description: "Reduces terminal flicker in the Claude Code TUI.",
      default: true,
    },
    {
      key: "scrollSpeed",
      type: "select" as const,
      envVar: "CLAUDE_CODE_SCROLL_SPEED",
      label: "TUI scroll speed",
      description: "Scroll speed inside the no-flicker TUI.",
      default: "5",
      options: Array.from({ length: 10 }, (_, i) => ({
        id: String(i + 1),
        label: `${i + 1}x`,
      })),
    },
  ],
};

/**
 * Built-in Claude model ids whose `[<size>]` suffix Lightcode owns — it derives
 * that suffix from the thread's `contextSize` selector (see
 * {@link applyClaudeContextSuffix}). Any model id NOT in this set is a custom /
 * external-provider model (e.g. z.ai `glm-5.2[1m]`) whose suffix is part of the
 * provider's real model name and must be sent to the CLI/SDK verbatim. Keyed off
 * `modelContextSizes` so adding a context-managed model stays a one-line change.
 */
export const CLAUDE_CONTEXT_MANAGED_MODEL_IDS: ReadonlySet<string> = new Set(
  Object.keys(claudeCapabilities.modelContextSizes ?? {}),
);

interface ClaudeAuthStatusResponse {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string;
  orgName?: string;
  subscriptionType?: string;
}

function titleCaseWords(value: string): string {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatClaudePlan(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /subscription$/i.test(trimmed)
    ? titleCaseWords(trimmed)
    : `${titleCaseWords(trimmed)} Subscription`;
}

export function parseClaudeAuthStatusJson(output: string): StatusProbeResult | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;

  let parsed: ClaudeAuthStatusResponse;
  try {
    parsed = JSON.parse(trimmed) as ClaudeAuthStatusResponse;
  } catch {
    return undefined;
  }

  const providerMetadata = compactAgentProviderMetadata({
    ...(parsed.email?.trim() ? { authenticatedAs: parsed.email.trim() } : {}),
    ...(parsed.orgName?.trim() ? { organization: parsed.orgName.trim() } : {}),
    ...(formatClaudePlan(parsed.subscriptionType)
      ? { plan: formatClaudePlan(parsed.subscriptionType) }
      : {}),
    ...(parsed.authMethod?.trim()
      ? { authMethod: parsed.authMethod === "claude.ai" ? "Claude.ai" : parsed.authMethod.trim() }
      : {}),
  });

  return {
    ...(parsed.loggedIn === true ? { authState: "authenticated" as const } : {}),
    ...(parsed.loggedIn === false ? { authState: "missing" as const } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

export async function probeClaudeStatus(
  ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0],
  options?: { env?: Record<string, string> },
) {
  if (!ctx.executablePath) return undefined;
  const result = await readAgentCommandOutput(
    ctx.location,
    ctx.executablePath,
    ["auth", "status"],
    {
      posixCwd: getAgentProbeCwd(ctx.location),
      ...(options?.env ? { env: options.env } : {}),
    },
  );
  const parsed = parseClaudeAuthStatusJson(result.stdout || result.stderr);
  if (parsed) return parsed;
  return result.ok ? { authState: "authenticated" as const } : { authState: "unknown" as const };
}

export const claudeDetectionSpec: DetectionSpec = {
  kind: "claude",
  label: "Claude Code",
  binary: "claude",
  loginCommand: "claude auth login",
  capabilities: claudeCapabilities,
  update: {
    builtIn: { binary: "claude", args: ["update"] },
    npm: "@anthropic-ai/claude-code",
    brew: "claude",
    winget: "Anthropic.ClaudeCode",
  },
  statusProbe: probeClaudeStatus,
  capabilitiesProbe: (ctx) => probeClaudeCapabilities(ctx),
};
