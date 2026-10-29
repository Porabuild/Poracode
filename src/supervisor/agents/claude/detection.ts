import { compactAgentProviderMetadata, type AgentCapability } from "@/shared/contracts";
import { readAgentCommandOutput, type DetectionSpec, type StatusProbeResult } from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import {
  claudeDefaultHiddenModels,
  CLAUDE_BUILTIN_FAST_MODELS,
  CLAUDE_BUILTIN_MODEL_CONTEXT_SIZES,
  CLAUDE_BUILTIN_MODEL_EFFORTS,
  CLAUDE_BUILTIN_MODELS,
  CLAUDE_PREMIUM_EFFORT_TIERS,
} from "./models";
import { probeClaudeCapabilities } from "./probe";
import { CLAUDE_CONTEXT_SIZES } from "./contextWindow";

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

export const claudeCapabilities: AgentCapability = {
  models: CLAUDE_BUILTIN_MODELS,
  defaultHiddenModels: claudeDefaultHiddenModels(CLAUDE_BUILTIN_MODELS),
  efforts: CLAUDE_PREMIUM_EFFORT_TIERS,
  defaultEffort: "medium",
  modelEfforts: CLAUDE_BUILTIN_MODEL_EFFORTS,
  contextSizes: CLAUDE_CONTEXT_SIZES,
  contextSizeChangeReloadsSession: true,
  // Order matters: the first entry is the per-model default. Frontier models
  // default to 400k; 1M stays selectable (see CLAUDE_LONG_CONTEXT_SIZES).
  modelContextSizes: CLAUDE_BUILTIN_MODEL_CONTEXT_SIZES,
  defaultContextSize: "200k",
  fastModels: CLAUDE_BUILTIN_FAST_MODELS,
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
  supportsOneShot: true,
  supportsReadOnlyOneShotWorkspace: true,
  supportsTextOnlyOneShot: true,
  supportsDirectInput: true,
  readsPdfAttachmentsFromHost: true,
  slashCommands: CLAUDE_BUILT_IN_SLASH_COMMANDS,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: CLAUDE_DEFAULT_APPROVAL_POLICY,
  bypassPermissions: { approvalPolicy: CLAUDE_DEFAULT_APPROVAL_POLICY },
  // SDK GUI sessions rebuild the MCP server set on every turn, so both
  // toggles stay live mid-thread. Terminal MCPs are fixed at launch.
  mcpScope: { terminal: "launch", gui: "always" },
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
      ...(ctx.signal ? { signal: ctx.signal } : {}),
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
