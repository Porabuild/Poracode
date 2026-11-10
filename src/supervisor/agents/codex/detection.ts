import {
  compactAgentProviderMetadata,
  type AgentCapability,
  type AgentTerminalAuthMethod,
} from "@/shared/contracts";
import {
  configFileAuthProbe,
  readAgentCommandOutput,
  type DetectionSpec,
  type StatusProbeResult,
} from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import {
  buildCodexContextSizeCapabilities,
  DEFAULT_CODEX_CONTEXT_WINDOWS,
  resolveCodexContextWindows,
} from "@/shared/agents/codexContextWindows";
import { probeCodexAccount, probeCodexCapabilities, type CodexProbeResult } from "./probe";
import { codexAuthPath } from "./sessionFiles";

const CODEX_BUILT_IN_SLASH_COMMANDS: NonNullable<AgentCapability["slashCommands"]> = [
  {
    id: "model",
    label: "model - Choose what model and reasoning effort to use",
    description: "Choose what model and reasoning effort to use",
  },
  {
    id: "presets",
    label: "presets - Choose a collaboration mode and reasoning effort preset",
    description: "Choose a collaboration mode and reasoning effort preset",
  },
  {
    id: "daybreak",
    label: "daybreak - Turn Daybreak on or off",
    description: "Turn Daybreak on or off",
  },
  {
    id: "ide",
    label: "ide - Manage IDE context integration",
    description: "Manage IDE context integration",
  },
  {
    id: "permissions",
    label: "permissions - Set what Codex can do without asking first",
    description: "Set what Codex can do without asking first",
  },
  {
    id: "keymap",
    label: "keymap - List active keybindings and keymap diagnostics",
    description: "List active keybindings and keymap diagnostics",
  },
  {
    id: "vim",
    label: "vim - Toggle Vim composer navigation",
    description: "Toggle Vim composer navigation",
  },
  {
    id: "setup-default-sandbox",
    label: "setup-default-sandbox - Set up elevated agent sandbox",
    description: "Set up elevated agent sandbox",
  },
  {
    id: "experimental",
    label: "experimental - Toggle experimental features",
    description: "Toggle experimental features",
  },
  {
    id: "approve",
    label: "approve - Configure tool call approval mode",
    description: "Configure tool call approval mode",
  },
  {
    id: "memories",
    label: "memories - Manage memory usage and reset stored memories",
    description: "Manage memory usage and reset stored memories",
  },
  {
    id: "skills",
    label: "skills - Use skills to improve how Codex performs specific tasks",
    description: "Use skills to improve how Codex performs specific tasks",
  },
  {
    id: "import",
    label: "import - Import setup, this project, and recent chats from Claude Code",
    description: "Import setup, this project, and recent chats from Claude Code",
  },
  {
    id: "hooks",
    label: "hooks - Inspect configured lifecycle hooks",
    description: "Inspect configured lifecycle hooks",
  },
  {
    id: "review",
    label: "review - Review my current changes and find issues",
    description: "Review my current changes and find issues",
  },
  {
    id: "rename",
    label: "rename - Rename the current thread",
    description: "Rename the current thread",
  },
  {
    id: "new",
    label: "new - Start a new chat during a conversation",
    description: "Start a new chat during a conversation",
  },
  {
    id: "archive",
    label: "archive - Archive the current thread and start a new one",
    description: "Archive the current thread and start a new one",
  },
  {
    id: "delete",
    label: "delete - Permanently delete the current thread and start a new one",
    description: "Permanently delete the current thread and start a new one",
  },
  {
    id: "resume",
    label: "resume - Resume a saved chat",
    description: "Resume a saved chat",
  },
  {
    id: "fork",
    label: "fork - Fork the current chat",
    description: "Fork the current chat",
  },
  {
    id: "worktree",
    label: "worktree - Manage Git worktrees, start a detached session, or configure auto-clean",
    description: "Manage Git worktrees, start a detached session, or configure auto-clean",
  },
  {
    id: "app",
    label: "app - Open this thread in the Codex desktop app",
    description: "Open this thread in the Codex desktop app",
  },
  {
    id: "init",
    label: "init - Create an AGENTS.md file with instructions for Codex",
    description: "Create an AGENTS.md file with instructions for Codex",
  },
  {
    id: "compact",
    label: "compact - Summarize conversation to prevent hitting the context limit",
    description: "Summarize conversation to prevent hitting the context limit",
  },
  {
    id: "config",
    label: "config - Edit configuration settings",
    description: "Edit configuration settings",
  },
  {
    id: "recap",
    label: "recap - Summarize where this session stands after returning",
    description: "Summarize where this session stands after returning",
  },
  {
    id: "plan",
    label: "plan - Switch to Plan mode",
    description: "Switch to Plan mode",
  },
  {
    id: "voice",
    label: "voice - Start or stop voice mode",
    description: "Start or stop voice mode",
  },
  {
    id: "goal",
    label: "goal - Set, edit, pause, resume, or clear the thread goal",
    description: "Set, edit, pause, resume, or clear the thread goal",
  },
  {
    id: "agents",
    label: "agents - Switch the active agent thread",
    description: "Switch the active agent thread",
  },
  {
    id: "side",
    label: "side - Open an ephemeral side conversation, or return to the parent thread",
    description: "Open an ephemeral side conversation, or return to the parent thread",
  },
  {
    id: "btw",
    label: "btw - Open an ephemeral side conversation, or return to the parent thread",
    description: "Open an ephemeral side conversation, or return to the parent thread",
  },
  {
    id: "copy",
    label: "copy - Copy the latest Codex output to your clipboard",
    description: "Copy the latest Codex output to your clipboard",
  },
  {
    id: "export",
    label: "export - Save the current conversation to a markdown file",
    description: "Save the current conversation to a markdown file",
  },
  {
    id: "raw",
    label: "raw - Toggle raw profile and raw prompt submission",
    description: "Toggle raw profile and raw prompt submission",
  },
  {
    id: "tui",
    label: "tui - Switch between the classic and scrollable TUI",
    description: "Switch between the classic and scrollable TUI",
  },
  {
    id: "diff",
    label: "diff - Show git diff (including untracked files)",
    description: "Show git diff (including untracked files)",
  },
  {
    id: "mention",
    label: "mention - Mention a file",
    description: "Mention a file",
  },
  {
    id: "status",
    label: "status - Show current session configuration and token usage",
    description: "Show current session configuration and token usage",
  },
  {
    id: "daemon",
    label: "daemon - Manage the background subagent daemon",
    description: "Manage the background subagent daemon",
  },
  {
    id: "warnings",
    label: "warnings - Toggle model warnings for this session",
    description: "Toggle model warnings for this session",
  },
  {
    id: "cd",
    label: "cd - Change the working directory for future commands",
    description: "Change the working directory for future commands",
  },
  {
    id: "pwd",
    label: "pwd - Show the current working directory",
    description: "Show the current working directory",
  },
  {
    id: "usage",
    label: "usage - Show rate limit usage",
    description: "Show rate limit usage",
  },
  {
    id: "debug-config",
    label: "debug-config - Show config layers and requirement sources for debugging",
    description: "Show config layers and requirement sources for debugging",
  },
  {
    id: "title",
    label: "title - Configure which items appear in the terminal title",
    description: "Configure which items appear in the terminal title",
  },
  {
    id: "statusline",
    label: "statusline - Configure which items appear in the status line",
    description: "Configure which items appear in the status line",
  },
  {
    id: "theme",
    label: "theme - Choose a syntax highlighting theme",
    description: "Choose a syntax highlighting theme",
  },
  {
    id: "pets",
    label: "pets - Adopt a terminal companion",
    description: "Adopt a terminal companion",
  },
  {
    id: "mcp",
    label: "mcp - List configured MCP tools",
    description: "List configured MCP tools",
  },
  {
    id: "apps",
    label: "apps - Manage apps",
    description: "Manage apps",
  },
  {
    id: "plugins",
    label: "plugins - Browse plugins",
    description: "Browse plugins",
  },
  {
    id: "logout",
    label: "logout - Log out of Codex",
    description: "Log out of Codex",
  },
  {
    id: "quit",
    label: "quit - Exit Codex",
    description: "Exit Codex",
  },
  {
    id: "exit",
    label: "exit - Exit Codex",
    description: "Exit Codex",
  },
  {
    id: "feedback",
    label: "feedback - Send logs to maintainers",
    description: "Send logs to maintainers",
  },
  {
    id: "ps",
    label: "ps - List background terminals",
    description: "List background terminals",
  },
  {
    id: "stop",
    label: "stop - Stop all background terminals",
    description: "Stop all background terminals",
  },
  {
    id: "clear",
    label: "clear - Clear the terminal and start a new chat",
    description: "Clear the terminal and start a new chat",
  },
  {
    id: "subagents",
    label: "subagents - View running and completed subagents",
    description: "View running and completed subagents",
  },
];

export const codexDefaultCapabilities: AgentCapability = {
  models: [],
  contextSizeChangeReloadsSession: true,
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
  // Terminal MCP config rides the `-c` launch argv. GUI sessions apply the
  // same shape as a per-thread app-server config override.
  mcpScope: { terminal: "launch", gui: "launch" },
  // Codex attaches its provider thread id to MCP tools/call `_meta.threadId`.
  // Crossagents resolves that id through the supervisor session registry, so
  // pooled GUI threads can share one credential without losing parent routing.
  crossagentMcpRouting: "provider-session",
  settingDefs: [],
  slashCommands: CODEX_BUILT_IN_SLASH_COMMANDS,
  // Codex delivers its enabled skills through the ACP session (`skills/list`),
  // so its GUI catalog is authoritative even when it reports zero skills.
  reportsSkillCatalog: true,
  ...buildCodexContextSizeCapabilities([], DEFAULT_CODEX_CONTEXT_WINDOWS),
};

export function probeResultToCapabilityPartial(probe: CodexProbeResult): Partial<AgentCapability> {
  const slashCommands = probe.slashCommands?.some((command) => command.section !== "skills")
    ? probe.slashCommands
    : [...CODEX_BUILT_IN_SLASH_COMMANDS, ...(probe.slashCommands ?? [])];
  return {
    ...(probe.liveVoice
      ? { liveVoice: { transport: "webrtc" as const, dataChannel: "oai-events" } }
      : {}),
    ...(probe.models?.length ? { models: probe.models } : {}),
    ...(probe.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe.sandboxModes?.length ? { sandboxModes: probe.sandboxModes } : {}),
    slashCommands,
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
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
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
    {
      posixCwd: getAgentProbeCwd(ctx.location),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
    },
  );
  const parsed = parseCodexLoginStatusOutput(`${result.stdout}\n${result.stderr}`);
  if (parsed) return parsed;
  return result.ok ? { authState: "authenticated" as const } : { authState: "unknown" as const };
}

const CODEX_TERMINAL_AUTH_METHOD: AgentTerminalAuthMethod = {
  type: "terminal",
  id: "codex-login",
  name: "Codex login",
  args: ["login"],
};

/**
 * The Settings login overlay runs `codex login` in a plain shell, so a
 * profile's `CODEX_HOME` must ride along on the auth method or the login
 * would land in the global `~/.codex`.
 */
export function codexTerminalAuthMethod(env?: Record<string, string>): AgentTerminalAuthMethod {
  return env ? { ...CODEX_TERMINAL_AUTH_METHOD, env } : CODEX_TERMINAL_AUTH_METHOD;
}

export const codexDetectionSpec: DetectionSpec = {
  kind: "codex",
  label: "Codex",
  binary: "codex",
  loginCommand: "codex login",
  capabilities: codexDefaultCapabilities,
  update: {
    builtIn: { binary: "codex", args: ["update"] },
    preferPackageManagerOnWindows: ["npm-global", "pnpm-global", "bun-global"],
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
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
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
      ...buildCodexContextSizeCapabilities(
        probe?.models?.map((model) => model.id) ?? [],
        resolveCodexContextWindows(ctx.agentSettings),
      ),
      authMethods: [codexTerminalAuthMethod(ctx.probeEnv)],
      authLogoutSupported: true,
    };
  },
};
