import { manageOpenCode2Credentials } from "./credentials";
import { manageOpenCode2Plugins } from "./plugins";
import type { AgentCapability, ResolvedMcpServer, PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import {
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  notInstalledAgentStatus,
  shortenHomePath,
  inheritBaseSpawnEnv,
  type AgentAdapter,
  type CreateStructuredSessionInput,
} from "../base";
import { buildOpenCode2Args } from "./argv";
import { openCode2DetectionSpec, opencode2DefaultCapabilities } from "./detection";
import { buildOpenCodeMcpLaunchConfig } from "../userMcp";
import { cachedOpenCode2Binary, resolveOpenCode2Binary } from "./binary";
import { shutdownSpawnedOpenCode2Servers } from "./client";
import { runOpenCode2OneShot } from "./oneShot";
import { OpenCode2Session } from "./session";
import { detectOpenCode2TerminalStatus, opencode2OscHint, opencode2OscTitleHint } from "./terminal";

// MCP env for terminal launches. OpenCode 2 shares OpenCode 1's config file
// conventions (`~/.config/opencode`, `OPENCODE_CONFIG_CONTENT` overlay — both
// verified against the beta binary), so the shared builder is reused as-is.
function buildOpenCode2McpEnv(
  mcpServers: readonly ResolvedMcpServer[] = [],
): Record<string, string> | undefined {
  if (mcpServers.length === 0) return undefined;
  const launch = buildOpenCodeMcpLaunchConfig(mcpServers);
  return {
    ...launch.env,
    OPENCODE_CONFIG_CONTENT: launch.configContent,
  };
}

export function createOpenCode2Adapter(): AgentAdapter {
  let capabilities: AgentCapability = opencode2DefaultCapabilities;

  return {
    managePlugins: manageOpenCode2Plugins,
    manageCredentials: manageOpenCode2Credentials,
    kind: openCode2DetectionSpec.kind,
    label: openCode2DetectionSpec.label,
    binary: openCode2DetectionSpec.binary,
    // Same skill roots and precedence as OpenCode 1: the V2 CLI loads the same
    // `~/.config/opencode` and `.opencode` skill directories.
    skillSupport: {
      roots: [
        {
          id: "opencode2",
          label: openCode2DetectionSpec.label,
          globalPath: ".config/opencode/skills",
          projectPath: ".opencode/skills",
          globalOverride: { env: "OPENCODE_CONFIG_DIR", path: "skills" },
        },
        {
          id: "opencode2-singular",
          label: openCode2DetectionSpec.label,
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
        global: ["opencode2", "opencode2-singular", "agents", "claude"],
        project: ["opencode2", "opencode2-singular", "agents", "claude"],
      },
    },
    ...(openCode2DetectionSpec.update ? { update: openCode2DetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    ...inheritBaseSpawnEnv(openCode2DetectionSpec),

    // ── Detection ────────────────────────────────────────────────────────
    async detectInstall(ctx) {
      const location = detectProbeLocation(ctx);
      const binary = await resolveOpenCode2Binary(location, ctx?.signal, true);
      if (!binary) {
        return notInstalledAgentStatus(openCode2DetectionSpec, opencode2DefaultCapabilities);
      }
      const status = await detectAgentInstall(ctx, { ...openCode2DetectionSpec, binary });
      capabilities = status.capabilities;
      return status;
    },

    // ── Launch / resume ──────────────────────────────────────────────────
    //
    // Session ID allocation: see `createStructuredSession` below. On a fresh
    // launch the runtime acquires the shared `opencode2 serve`, calls
    // `session.create`, captures the resulting `ses_xxx` id into
    // `launchOptions.resumeThreadId`, and then releases its acquisition
    // (because `liveInputMode === "terminal"`). The TUI process below picks
    // the pre-allocated id up via `--session <id>`.
    buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      const sessionId = launchOptions?.resumeThreadId;
      const env = buildOpenCode2McpEnv(launchOptions?.mcpServers ?? []);
      return {
        binary: cachedOpenCode2Binary(location) ?? "opencode2",
        args: buildOpenCode2Args(config, prompt, sessionId),
        ...(env ? { env } : {}),
        preferShell: true,
        ...(sessionId ? { sessionRef: createKnownSessionRef(sessionId) } : {}),
      };
    },
    buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      const env = buildOpenCode2McpEnv(launchOptions?.mcpServers ?? []);
      return {
        binary: cachedOpenCode2Binary(location) ?? "opencode2",
        args: buildOpenCode2Args(config, prompt, sessionRef.providerSessionId),
        ...(env ? { env } : {}),
        preferShell: true,
      };
    },
    createInitialSessionRef() {
      return undefined;
    },

    // ── Structured session (V2 HTTP server for both modes) ──────────────
    //
    // Terminal mode (default): runtime calls `activate()` + `openThread()`,
    // captures the returned session id into `launchOptions.resumeThreadId`,
    // then releases its acquisition (`liveInputMode === "terminal"`). The TUI
    // launches with `--session <id>` and resumes from the shared on-disk
    // session store, so the supervisor knows the providerSessionId
    // synchronously instead of polling after spawn.
    //
    // GUI mode: same handle stays alive for the thread's lifetime; the shared
    // SSE stream routes V2 events through `eventMapping` into chat items.
    async createStructuredSession(input: CreateStructuredSessionInput) {
      return OpenCode2Session.create(input);
    },

    shutdown: shutdownSpawnedOpenCode2Servers,
    runOneShot: runOpenCode2OneShot,
    runTextOnlyOneShot: runOpenCode2OneShot,

    // ── Input ────────────────────────────────────────────────────────────
    buildDirectInput(prompt) {
      const hasInnerNewline = prompt.includes("\n");
      const payload = hasInnerNewline ? `\x1b[200~${prompt}\x1b[201~` : prompt;
      return [payload, "@wait:60", "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((segment) => segment.kind === "attachment");
      const rest = segments.filter((segment) => segment.kind !== "attachment");
      const attachmentLines = attachments
        .map((segment) => `@${shortenHomePath(segment.path)}`)
        .join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    // OpenCode 1's TUI silently ignores `--prompt` when `--session <id>` is
    // also present. The V2 TUI is unverified for that combination, so resume
    // launches defer the prompt to the PTY either way: the runtime queues it
    // as `pendingTerminalPrompt` and types it via `buildDirectInput` once the
    // input box is up.
    shouldDeferPromptToTerminal() {
      return true;
    },
    // Gate for flushing the deferred initial prompt. Matches the keybind
    // footer the idle hint uses — it's painted only when the TUI accepts
    // input. Only consulted while a hook plugin is active, which V2 has none
    // of yet, so this stays a no-op in practice until L1 lands.
    isReadyForInitialPrompt(text) {
      return /\btab\s*agents|\bctrl\+p\s*commands/i.test(text);
    },

    // ── L2 (terminal heuristics + OSC) ───────────────────────────────────
    detectTerminalStatus: detectOpenCode2TerminalStatus,
    handleOscNotification: opencode2OscHint,
    handleOscTitle: opencode2OscTitleHint,
    workingSilenceTimeoutMs: null,
  };
}
