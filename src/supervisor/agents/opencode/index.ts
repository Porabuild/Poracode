import { OPENCODE_PROVIDER_KIND } from "@/shared/agents/opencode";
import {
  parseOpenCodeProfileInstanceConfig,
  opencodeProfileKind,
} from "@/shared/agents/opencode/profileConfig";
import {
  type AgentCapability,
  type AgentInstanceConfig,
  type AgentStatus,
  type PromptSegment,
} from "@/shared/contracts";
import { parseOpenCodeProfileRuntime, type OpenCodeProfileRuntime } from "./profileConfig";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import {
  bracketedPasteDirectInput,
  detectAgentInstall,
  detectProbeLocation,
  inheritBaseSpawnEnv,
  notInstalledAgentStatus,
  shortenHomePath,
  type AgentAdapter,
  type CreateStructuredSessionInput,
} from "../base";
import { resolveOpenCodeBinary } from "./binary";
import { shutdownSpawnedOpenCodeServers } from "./client";
import { manageOpenCodeCredentials } from "./credentials";
import { opencodeDefaultCapabilities, openCodeDetectionSpec } from "./detection";
import { readOpenCodeMcpSessionId } from "./mcp";
import { runOpenCodeOneShot } from "./oneShot";
import { listNativeOpenCodePlugins, manageOpenCodePlugins } from "./plugins";
import { OpenCodeSession } from "./session";
import { detectOpenCodeTerminalStatus, opencodeOscHint, opencodeOscTitleHint } from "./terminal";
import { buildOpenCodeTerminalLaunch } from "./terminalLaunch";

export interface OpenCodeAdapterOptions {
  kind?: string;
  label?: string;
  /** Isolated model profile. The base adapter omits this. */
  profile?: OpenCodeProfileRuntime;
}

function profileCapabilities(profile: OpenCodeProfileRuntime, label: string): AgentCapability {
  return {
    ...opencodeDefaultCapabilities,
    models: [{ id: profile.model, label: profile.modelLabel }],
    subProviders: [{ id: profile.model.slice(0, profile.model.indexOf("/")), label }],
  };
}

function applyProfileModel(
  status: AgentStatus,
  profile: OpenCodeProfileRuntime,
  kind: string,
  label: string,
): AgentStatus {
  const next: AgentStatus = {
    ...status,
    kind,
    label,
    // A local profile is credential-free: its private provider uses a dummy key
    // and never borrows the base account's auth or identity.
    authState: "authenticated",
    capabilities: profileCapabilities(profile, label),
  };
  delete next.providerMetadata;
  delete next.loginCommand;
  delete next.loginCommandDisplay;
  delete next.authMethods;
  delete next.authLogoutSupported;
  return next;
}

export function createOpenCodeAdapter(options: OpenCodeAdapterOptions = {}): AgentAdapter {
  let capabilities: AgentCapability = opencodeDefaultCapabilities;
  const kind = options.kind ?? OPENCODE_PROVIDER_KIND;
  const label = options.label ?? openCodeDetectionSpec.label;
  const profileScoped = options.kind !== undefined || options.label !== undefined;
  if (options.profile) capabilities = profileCapabilities(options.profile, label);

  return {
    // A private profile owns an isolated config dir and dummy credential; the
    // base provider's plugin and credential mutations must not reach it.
    ...(options.profile
      ? {}
      : {
          managePlugins: manageOpenCodePlugins,
          listNativePlugins: listNativeOpenCodePlugins,
          manageCredentials: manageOpenCodeCredentials,
        }),
    kind,
    label,
    binary: openCodeDetectionSpec.binary,
    poolsDirectoryMcp: true,
    ...(options.profile
      ? {}
      : {
          skillSupport: {
            roots: [
              {
                id: "opencode",
                label: openCodeDetectionSpec.label,
                globalPath: ".config/opencode/skills",
                projectPath: ".opencode/skills",
                globalOverride: { env: "OPENCODE_CONFIG_DIR", path: "skills" },
              },
              {
                id: "opencode-singular",
                label: openCodeDetectionSpec.label,
                globalPath: ".config/opencode/skill",
                projectPath: ".opencode/skill",
                globalOverride: { env: "OPENCODE_CONFIG_DIR", path: "skill" },
              },
              {
                id: "claude",
                label: "Claude-compatible skills",
                globalPath: ".claude/skills",
                projectPath: ".claude/skills",
              },
              {
                // OpenCode auto-loads `~/.agents/skills` and project `.agents/skills`
                // (verified against the shipped binary's scan globs).
                id: "agents",
                label: "Shared agent skills",
                globalPath: ".agents/skills",
                projectPath: ".agents/skills",
              },
            ],
            invocation: "prompt",
            precedence: {
              global: ["opencode", "opencode-singular", "agents", "claude"],
              project: ["opencode", "opencode-singular", "agents", "claude"],
            },
          },
        }),
    ...(openCodeDetectionSpec.update ? { update: openCodeDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    ...inheritBaseSpawnEnv(openCodeDetectionSpec),

    // ── Detection ────────────────────────────────────────────────────────
    async detectInstall(ctx) {
      const location = detectProbeLocation(ctx);
      const binary = await resolveOpenCodeBinary(location, ctx?.signal, true);
      if (!binary) {
        return notInstalledAgentStatus(
          profileScoped ? { ...openCodeDetectionSpec, kind, label } : openCodeDetectionSpec,
          options.profile
            ? profileCapabilities(options.profile, label)
            : opencodeDefaultCapabilities,
        );
      }
      const detected = await detectAgentInstall(ctx, { ...openCodeDetectionSpec, binary });
      const status = options.profile
        ? applyProfileModel(detected, options.profile, kind, label)
        : { ...detected, kind, label };
      capabilities = status.capabilities;
      return status;
    },

    // ── Launch / resume ──────────────────────────────────────────────────
    //
    // Session ID allocation: see `createStructuredSession` below. On a fresh
    // launch the runtime acquires the shared `opencode serve`, calls
    // `session.create`, captures the resulting `ses_xxx` id into
    // `launchOptions.resumeThreadId`, and then releases its acquisition
    // (because `liveInputMode === "terminal"`). The TUI process below picks
    // the pre-allocated id up via `--session <id>`.
    buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      return buildOpenCodeTerminalLaunch(
        location,
        config,
        prompt,
        launchOptions?.resumeThreadId ?? _sessionRef?.providerSessionId,
        launchOptions?.mcpServers,
        launchOptions?.onTerminalStatusUpdate,
        options.profile,
      );
    },
    buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      return buildOpenCodeTerminalLaunch(
        location,
        config,
        prompt,
        sessionRef.providerSessionId,
        launchOptions?.mcpServers,
        launchOptions?.onTerminalStatusUpdate,
        options.profile,
      );
    },
    createInitialSessionRef() {
      return undefined;
    },
    readMcpSessionId: readOpenCodeMcpSessionId,

    // ── Structured session (V2 HTTP server for both modes) ──────────────
    //
    // GUI mode (default): handle stays alive for the thread's lifetime; the
    // shared SSE stream routes V2 events through `eventMapping` into chat items.
    //
    // Terminal mode: runtime calls `activate()` + `openThread()`, captures the
    // returned session id into `launchOptions.resumeThreadId`, then releases
    // its preparation acquisition. Terminal argv acquires its own lease before
    // that release and passes `--server` + `--session`, keeping dynamic MCP
    // permissions and L1 SSE status synced until its PTY cleanup runs.
    async createStructuredSession(input: CreateStructuredSessionInput) {
      return OpenCodeSession.create(input, options.profile);
    },

    ...(options.profile ? {} : { shutdown: shutdownSpawnedOpenCodeServers }),
    runOneShot: (input) => runOpenCodeOneShot(input, options.profile),
    runTextOnlyOneShot: (input) => runOpenCodeOneShot(input, options.profile),

    // ── Input ────────────────────────────────────────────────────────────
    buildDirectInput: bracketedPasteDirectInput,
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((segment) => segment.kind === "attachment");
      const rest = segments.filter((segment) => segment.kind !== "attachment");
      const attachmentLines = attachments
        .map((segment) => `@${shortenHomePath(segment.path)}`)
        .join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    // Defer initial prompt to the PTY when resuming or starting with `--server` + `--session`:
    // the runtime queues it as `pendingTerminalPrompt` and types it via `buildDirectInput`
    // once the input box is up.
    shouldDeferPromptToTerminal() {
      return true;
    },
    // Gate for flushing the deferred initial prompt. Matches the keybind
    // footer the idle hint uses — it's painted only when the TUI accepts
    // input. Only consulted while a hook plugin is active.
    isReadyForInitialPrompt(text) {
      return /\btab\s*agents|\bctrl\+p\s*commands/i.test(text);
    },

    // ── L2 (terminal heuristics + OSC) ───────────────────────────────────
    detectTerminalStatus: detectOpenCodeTerminalStatus,
    handleOscNotification: opencodeOscHint,
    handleOscTitle: opencodeOscTitleHint,
    workingSilenceTimeoutMs: null,
  };
}

/**
 * A named OpenCode model profile: its own provider config and database on the
 * same host, launched as `opencode:<id>`. A profile never shares a server lease
 * with the base agent or another profile.
 */
export function createOpenCodeProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const config = parseOpenCodeProfileInstanceConfig(instance.config);
  const label = `OpenCode ${instance.displayName ?? instance.id}`;
  const profile = config.connection === "local" ? parseOpenCodeProfileRuntime(instance) : undefined;
  return createOpenCodeAdapter({
    kind: opencodeProfileKind(instance.id),
    label,
    ...(profile ? { profile } : {}),
  });
}
