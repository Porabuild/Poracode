import {
  compactAgentProviderMetadata,
  type AgentAuthMethod,
  type AgentCapability,
} from "@/shared/contracts";
import {
  configFileAuthProbe,
  readAgentCommandOutput,
  type DetectionSpec,
  type StatusProbeResult,
} from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import { probeCodexAccount, probeCodexCapabilities, type CodexProbeResult } from "./probe";
import { codexAuthPath } from "./sessionFiles";

const CODEX_BUILT_IN_SLASH_COMMANDS: AgentCapability["slashCommands"] = [
  {
    id: "permissions",
    label: "permissions - Set what Codex can do without asking first",
    description: "Set what Codex can do without asking first",
  },
  {
    id: "agent",
    label: "agent - Switch the active agent thread",
    description: "Switch the active agent thread",
  },
  {
    id: "apps",
    label: "apps - Browse apps and insert them into your prompt",
    description: "Browse apps and insert them into your prompt",
  },
  {
    id: "plugins",
    label: "plugins - Browse installed and discoverable plugins",
    description: "Browse installed and discoverable plugins",
  },
  {
    id: "clear",
    label: "clear - Clear the terminal and start a fresh chat",
    description: "Clear the terminal and start a fresh chat",
  },
  {
    id: "compact",
    label: "compact - Summarize the visible conversation to free tokens",
    description: "Summarize the visible conversation to free tokens",
  },
  {
    id: "copy",
    label: "copy - Copy the latest completed Codex output",
    description: "Copy the latest completed Codex output",
  },
  {
    id: "diff",
    label: "diff - Show the Git diff",
    description: "Show the Git diff",
  },
  {
    id: "experimental",
    label: "experimental - Toggle experimental features",
    description: "Toggle experimental features",
  },
  {
    id: "feedback",
    label: "feedback - Send logs to the Codex maintainers",
    description: "Send logs to the Codex maintainers",
  },
  {
    id: "init",
    label: "init - Generate an AGENTS.md scaffold",
    description: "Generate an AGENTS.md scaffold",
  },
  {
    id: "logout",
    label: "logout - Sign out of Codex",
    description: "Sign out of Codex",
  },
  {
    id: "mcp",
    label: "mcp - List configured MCP tools",
    description: "List configured MCP tools",
  },
  {
    id: "mention",
    label: "mention - Attach a file to the conversation",
    description: "Attach a file to the conversation",
  },
  {
    id: "model",
    label: "model - Choose the active model",
    description: "Choose the active model",
  },
  {
    id: "fast",
    label: "fast - Toggle Fast mode for supported models",
    description: "Toggle Fast mode for supported models",
  },
  {
    id: "plan",
    label: "plan - Switch to plan mode and optionally send a prompt",
    description: "Switch to plan mode and optionally send a prompt",
  },
  {
    id: "goal",
    label: "goal - Set or view an experimental goal",
    description: "Set or view an experimental goal",
  },
  {
    id: "personality",
    label: "personality - Choose a communication style",
    description: "Choose a communication style",
  },
  {
    id: "ps",
    label: "ps - Show background terminals and recent output",
    description: "Show background terminals and recent output",
  },
  {
    id: "stop",
    label: "stop - Stop all background terminals",
    description: "Stop all background terminals",
  },
  {
    id: "fork",
    label: "fork - Fork the current conversation",
    description: "Fork the current conversation",
  },
  {
    id: "side",
    label: "side - Start an ephemeral side conversation",
    description: "Start an ephemeral side conversation",
  },
  {
    id: "resume",
    label: "resume - Resume a saved conversation",
    description: "Resume a saved conversation",
  },
  {
    id: "new",
    label: "new - Start a new conversation",
    description: "Start a new conversation",
  },
  {
    id: "quit",
    label: "quit - Exit the CLI",
    description: "Exit the CLI",
  },
  {
    id: "exit",
    label: "exit - Exit the CLI",
    description: "Exit the CLI",
  },
  {
    id: "review",
    label: "review - Ask Codex to review your working tree",
    description: "Ask Codex to review your working tree",
  },
  {
    id: "status",
    label: "status - Display session configuration and token usage",
    description: "Display session configuration and token usage",
  },
  {
    id: "debug-config",
    label: "debug-config - Print config layer and requirement diagnostics",
    description: "Print config layer and requirement diagnostics",
  },
  {
    id: "statusline",
    label: "statusline - Configure TUI status-line fields",
    description: "Configure TUI status-line fields",
  },
  {
    id: "title",
    label: "title - Configure terminal title fields",
    description: "Configure terminal title fields",
  },
  {
    id: "keymap",
    label: "keymap - Remap TUI keyboard shortcuts",
    description: "Remap TUI keyboard shortcuts",
  },
  {
    id: "sandbox-add-read-dir",
    label: "sandbox-add-read-dir - Grant sandbox read access to an extra directory",
    description: "Grant sandbox read access to an extra directory",
  },
];

export const codexDefaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "on-request",
  defaultApprovalsReviewer: "auto_review",
  defaultSandboxMode: "workspace-write",
  bypassPermissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
  // MCP config rides the `-c` launch argv in both presentations — baked in at
  // spawn, read-only once the session is running.
  mcpScope: { terminal: "launch", gui: "launch" },
  settingDefs: [],
  slashCommands: CODEX_BUILT_IN_SLASH_COMMANDS,
  // Codex delivers its enabled skills through the ACP session (`skills/list`),
  // so its GUI catalog is authoritative even when it reports zero skills.
  reportsSkillCatalog: true,
};

export function probeResultToCapabilityPartial(probe: CodexProbeResult): Partial<AgentCapability> {
  return {
    ...(probe.models?.length ? { models: probe.models } : {}),
    ...(probe.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe.sandboxModes?.length ? { sandboxModes: probe.sandboxModes } : {}),
    ...(probe.slashCommands?.length ? { slashCommands: probe.slashCommands } : {}),
    ...(probe.disabledSkillNames ? { disabledSkillNames: probe.disabledSkillNames } : {}),
    // Only models whose `model/list` entry advertises the Fast/priority service
    // tier can opt into Fast — the probe filters these from per-model tier data
    // (with a legacy fallback to all models when the CLI omits the fields).
    ...(probe.fastModels?.length ? { fastModels: probe.fastModels } : {}),
  };
}

export function parseCodexLoginStatusOutput(output: string): StatusProbeResult | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;

  const authMethodMatch = /logged in using\s+(.+)$/im.exec(trimmed);
  if (authMethodMatch) {
    const providerMetadata = compactAgentProviderMetadata({
      authMethod: authMethodMatch[1]?.trim(),
    });
    return {
      authState: "authenticated",
      ...(providerMetadata ? { providerMetadata } : {}),
    };
  }

  if (/not\s+logged\s+in|login required|sign in/i.test(trimmed)) {
    return { authState: "missing" };
  }

  return undefined;
}

/**
 * Display labels for Codex `account/read` `planType` values so the same plan
 * token renders consistently for users moving between ecosystems.
 */
const CODEX_PLAN_LABELS: Record<string, string> = {
  free: "ChatGPT Free",
  go: "ChatGPT Go",
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro 20x",
  prolite: "ChatGPT Pro 5x",
  team: "ChatGPT Team",
  business: "ChatGPT Business",
  self_serve_business_usage_based: "ChatGPT Business",
  enterprise: "ChatGPT Enterprise",
  enterprise_cbp_usage_based: "ChatGPT Enterprise",
  edu: "ChatGPT Edu",
  unknown: "ChatGPT",
};

export function formatCodexPlanLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (CODEX_PLAN_LABELS[lower]) return CODEX_PLAN_LABELS[lower]!;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const CODEX_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  apiKey: "OpenAI API key",
  amazonBedrock: "Amazon Bedrock",
};

async function probeCodexStatus(ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0]) {
  if (!ctx.executablePath) return undefined;

  // Primary: Codex's `app-server` JSON-RPC `account/read` returns rich,
  // sanctioned account metadata (email, planType, type) without us touching
  // credential files. Falls through to `codex login status` parsing if the
  // app-server fails (e.g. older CLI, transient probe error).
  const account = await probeCodexAccount(ctx.location, {
    ...(ctx.location.kind === "wsl" ? { wslExecPath: ctx.executablePath } : {}),
    label:
      ctx.location.kind === "wsl"
        ? `account:wsl:${ctx.location.distro}`
        : `account:${ctx.location.kind}`,
  });

  if (account) {
    const isChatGpt = account.type === "chatgpt";
    const planLabel = account.planType ? formatCodexPlanLabel(account.planType) : undefined;
    const authMethodLabel =
      !isChatGpt && account.type
        ? (CODEX_ACCOUNT_TYPE_LABELS[account.type] ?? account.type)
        : undefined;
    const providerMetadata = compactAgentProviderMetadata({
      ...(account.email ? { authenticatedAs: account.email } : {}),
      ...(isChatGpt && planLabel ? { plan: planLabel } : {}),
      ...(authMethodLabel ? { authMethod: authMethodLabel } : {}),
    });
    if (providerMetadata) {
      return { authState: "authenticated" as const, providerMetadata };
    }
    if (account.email || account.type) {
      return { authState: "authenticated" as const };
    }
  }

  const result = await readAgentCommandOutput(
    ctx.location,
    ctx.executablePath,
    ["login", "status"],
    { posixCwd: getAgentProbeCwd(ctx.location) },
  );
  const parsed = parseCodexLoginStatusOutput(`${result.stdout}\n${result.stderr}`);
  if (parsed) return parsed;
  return result.ok ? { authState: "authenticated" as const } : { authState: "unknown" as const };
}

const CODEX_TERMINAL_AUTH_METHOD: AgentAuthMethod = {
  type: "terminal",
  id: "codex-login",
  name: "Codex login",
  args: ["login"],
};

export const codexDetectionSpec: DetectionSpec = {
  kind: "codex",
  label: "Codex",
  binary: "codex",
  loginCommand: "codex login",
  capabilities: codexDefaultCapabilities,
  update: {
    builtIn: { binary: "codex", args: ["update"] },
    npm: "@openai/codex",
  },
  statusProbe: probeCodexStatus,
  authProbes: [
    // Auth file lives on the host — skip for WSL projects (matches prior "unknown").
    configFileAuthProbe((loc) => (loc.kind === "wsl" ? undefined : codexAuthPath())),
  ],
  async capabilitiesProbe(ctx) {
    const probe = await probeCodexCapabilities(ctx.location, {
      ...(ctx.location.kind === "wsl" && ctx.executablePath
        ? { wslExecPath: ctx.executablePath }
        : {}),
      timeoutMs: 12_000,
      label:
        ctx.location.kind === "wsl"
          ? `codex:wsl:${ctx.location.distro}`
          : `codex:${ctx.location.kind}`,
    });
    // Always advertise the terminal login + `codex logout` capabilities when
    // the binary is installed — the Settings UI gates Login/Logout on these
    // fields, and the supervisor's logout dispatcher uses the adapter's
    // `buildAcpLogoutCommand` to invoke `codex logout`. Mirrors Claude.
    return {
      ...(probe ? probeResultToCapabilityPartial(probe) : {}),
      authMethods: [CODEX_TERMINAL_AUTH_METHOD],
      authLogoutSupported: true,
    };
  },
};
