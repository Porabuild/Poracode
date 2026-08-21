import type { AgentInstanceConfig, PromptSegment } from "@/shared/contracts";
import { cursorProfileKind } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { createAcpStructuredSession } from "../acp";
import {
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  inheritBaseSpawnEnv,
  mergeSpawnEnv,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
  type TerminalStatusHint,
} from "../base";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { transformCursorAcpSessionUpdate } from "./acpTransform";
import { handleCursorAcpExtensionNotification } from "./acpExtension";
import { buildCursorArgs } from "./argv";
import {
  cursorDefaultCapabilities,
  cursorDetectionSpec,
  isCursorVersionSupportedForHooks,
} from "./detection";
import {
  installCursorPlugin,
  isCursorPluginInstalled,
  readBundledCursorPluginVersion,
  uninstallCursorPlugin,
} from "./plugin/install";
import { createCursorChatSync } from "./session";
import { CURSOR_IDLE_RE, CURSOR_WORKING_RE, detectCursorTerminalStatus } from "./terminal";
import { applyCursorSdkProbe, probeCursorSdkRuntime } from "./sdkDetection";
import { CursorSdkSession } from "./sdkSession";
import { buildCursorAgentCommand, buildCursorArgvSpec } from "./windowsExecutable";
import {
  configuredCursorStructuredRuntime,
  CURSOR_SDK_SESSION_PREFIX,
  resolveCursorStructuredRuntime,
} from "./structuredRuntime";

export {
  buildCursorAcpModelPickerCapabilities,
  buildCursorModelPickerCapabilities,
  buildCursorProbeSpec,
  parseCursorModels,
  sortCursorModels,
} from "./detection";
export { detectCursorTerminalStatus } from "./terminal";

const CURSOR_PLUGIN_VERSION = readBundledCursorPluginVersion();

warnIfPluginManifestMissing("cursor", CURSOR_PLUGIN_VERSION);

interface CursorAdapterOptions {
  kind?: string;
  label?: string;
  apiKey?: string;
}

export function createCursorProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const apiKey = instance.environment?.CURSOR_API_KEY?.value.trim();
  if (!apiKey) {
    throw new Error("Cursor profiles require a CURSOR_API_KEY.");
  }
  const profileLabel = instance.displayName ?? instance.id;
  return createCursorAdapter({
    kind: cursorProfileKind(instance.id),
    label: `Cursor ${profileLabel}`,
    apiKey,
  });
}

/**
 * Hook coverage gap: Cursor's `beforeShellExecution` / `beforeMCPExecution`
 * fire on every command, not only when the user is being prompted for
 * approval. Keep the existing terminal regex (`CURSOR_ATTENTION_RE` matching
 * `Run this command?` / `Suggested Plan` / `Waiting for approval`)
 * authoritative for `needs_approval` while hooks own the rest.
 */
function cursorHookActiveTerminalFallback(hint: TerminalStatusHint): boolean {
  return hint.status === "needs_approval";
}

function withoutCursorProfileLogin(status: Awaited<ReturnType<typeof detectAgentInstall>>) {
  const {
    authLogoutSupported: _authLogoutSupported,
    authMethods: _authMethods,
    loginCommand: _loginCommand,
    preferTerminalLogin: _preferTerminalLogin,
    ...profileStatus
  } = status;
  return profileStatus;
}

/**
 * Cursor's ACP server advertises `loadSession: true` but immediately rejects
 * every sessionId it issues via `session/new` with `-32602 Session not found`.
 * Acknowledged Cursor bug (forum thread #155516) with no client workaround, so
 * we replace the raw transport error with copy that names the limitation.
 */
export function rewriteCursorLoadSessionError(error: unknown, _sessionId: string): Error {
  const message =
    "Cursor's ACP integration doesn't currently support resuming chat sessions. Start a new thread to continue.";
  return Object.assign(new Error(message), { cause: error });
}

export function createCursorAdapter(options: CursorAdapterOptions = {}): AgentAdapter {
  const kind = options.kind ?? cursorDetectionSpec.kind;
  const label = options.label ?? cursorDetectionSpec.label;
  const detectionSpec = options.apiKey
    ? {
        ...cursorDetectionSpec,
        kind,
        label,
        baseSpawnEnv: {
          ...cursorDetectionSpec.baseSpawnEnv,
          CURSOR_API_KEY: options.apiKey,
        },
      }
    : cursorDetectionSpec;
  return {
    kind,
    label,
    binary: detectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "cursor",
          label,
          globalPath: ".cursor/skills",
          projectPath: ".cursor/skills",
        },
        {
          id: "cursor-legacy",
          label,
          globalPath: ".cursor/skills-cursor",
        },
        {
          // cursor-agent natively scans `.agents/skills/` (verified against the
          // shipped binary's scan-root list) — no projection or prompt
          // injection needed for canonical skills.
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
        {
          id: "claude",
          label: "Claude-compatible skills",
          globalPath: ".claude/skills",
          projectPath: ".claude/skills",
        },
        {
          id: "codex",
          label: "Codex-compatible skills",
          globalPath: ".codex/skills",
          projectPath: ".codex/skills",
          globalOverride: { env: "CODEX_HOME", path: "skills" },
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["cursor", "agents", "claude", "codex", "cursor-legacy"],
        project: ["cursor", "agents", "claude", "codex"],
      },
    },
    ...(detectionSpec.update ? { update: detectionSpec.update } : {}),
    ...inheritBaseSpawnEnv(detectionSpec),
    // Detection returns environment-scoped capabilities through AgentStatus.
    // Keep the adapter's process-wide fallback immutable: native and WSL
    // probes run concurrently, and a mutable singleton lets the last probe
    // change routing for every other environment.
    capabilities: cursorDefaultCapabilities,
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    pluginId: "poracode-status@cursor",
    pluginVersion: CURSOR_PLUGIN_VERSION,
    minProtocolVersion: 1,

    async isPluginSupported(ctx) {
      return await isCursorVersionSupportedForHooks(ctx);
    },
    async isPluginInstalled(ctx) {
      return isCursorPluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installCursorPlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      uninstallCursorPlugin(ctx);
    },

    detectInstall: async (ctx) => {
      const [detectedCliStatus, sdkProbe] = await Promise.all([
        detectAgentInstall(ctx, detectionSpec),
        options.apiKey
          ? probeCursorSdkRuntime(ctx, {}, options.apiKey)
          : probeCursorSdkRuntime(ctx),
      ]);
      // `baseSpawnEnv` intentionally carries the profile key into every real
      // provider process. Detection also uses it to decorate renderer-driven
      // terminal login methods, so remove those methods for profiles before
      // the status crosses IPC; the encrypted profile editor owns auth.
      const cliStatus = options.apiKey
        ? withoutCursorProfileLogin(detectedCliStatus)
        : detectedCliStatus;
      return applyCursorSdkProbe(
        cliStatus,
        sdkProbe,
        options.apiKey && ctx?.agentSettings?.structuredRuntime === undefined
          ? "sdk"
          : configuredCursorStructuredRuntime(ctx?.agentSettings),
      );
    },
    // Cursor CLI has no documented per-launch MCP config or isolated config
    // home. Do not project launchOptions.mcpServers into the user's persistent
    // ~/.cursor/mcp.json; ACP sessions receive MCP servers through ACP itself.
    buildLaunchArgv(location, config, prompt) {
      const chatId = createCursorChatSync(location);
      const args = buildCursorArgs(config, prompt, chatId);
      return {
        ...buildCursorArgvSpec(location, args),
        ...(chatId ? { sessionRef: createKnownSessionRef(chatId) } : {}),
      };
    },
    buildResumeArgv(_location, config, prompt, sessionRef) {
      const args = buildCursorArgs(config, prompt, sessionRef.providerSessionId);
      return buildCursorArgvSpec(_location, args);
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.presentationMode === "gui") {
        const agentSettings = options.apiKey
          ? {
              ...input.agentSettings,
              sdkApiKey: options.apiKey,
              ...(input.agentSettings?.structuredRuntime === undefined
                ? { structuredRuntime: "sdk" }
                : {}),
            }
          : input.agentSettings;
        const resolved = resolveCursorStructuredRuntime(agentSettings, input.sessionRef);
        if (resolved.runtime === "sdk") {
          const env = mergeSpawnEnv(input.env, input.baseSpawnEnv);
          return CursorSdkSession.create({
            ...input,
            ...(agentSettings ? { agentSettings } : {}),
            ...(env ? { env } : {}),
          });
        }
      }
      const command = buildCursorAgentCommand(input.projectLocation, ["acp"]);
      return createAcpStructuredSession(command, {
        ...input,
        loadSessionErrorRewriter: rewriteCursorLoadSessionError,
        acpSessionUpdateTransform: transformCursorAcpSessionUpdate,
        acpExtensionNotificationHandler: handleCursorAcpExtensionNotification,
      });
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildCursorAgentCommand(location, ["acp"]);
    },
    async buildAcpLogoutCommand(ctx) {
      return buildCursorAgentCommand(detectProbeLocation(ctx), ["logout"]);
    },
    buildDirectInput(prompt, _segments, _config, projectLocation) {
      // Cursor's TUI debounces fast incoming bytes as a paste burst. With
      // less than ~120ms between the text and Enter, the agent submits but
      // the input repaint never fires and the prompt visually stays in the
      // input box. 150ms is the empirically-tested floor that lets the TUI
      // settle before the Enter keystroke.
      //
      // On Windows, no inner-newline sequence keeps text in Cursor's
      // composer (raw LF, CR, and bracketed paste all trigger submit).
      // Flatten to single-line so the prompt lands as one submission.
      const payload = projectLocation?.kind === "windows" ? prompt.replace(/\n/g, " ") : prompt;
      return [payload, "@wait:150", "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    isReadyForInitialPrompt(text) {
      return CURSOR_IDLE_RE.test(text) && !CURSOR_WORKING_RE.test(text);
    },
    detectTerminalStatus(text) {
      return detectCursorTerminalStatus(text);
    },
    shouldApplyTerminalStatusWhileHookActive: cursorHookActiveTerminalFallback,
    defaultOneShotModel: "composer-2.5",
    buildOneShotCommand(model, _effort, _prompt, location) {
      const args = ["--print", "--force", "--trust", "--output-format", "json"];
      if (model && model !== "auto") {
        args.push("--model", model);
      }
      if (location) {
        const spec = buildCursorArgvSpec(location, args);
        return { command: spec.binary, args: spec.args, ...(spec.env ? { env: spec.env } : {}) };
      }
      return { command: "cursor-agent", args };
    },
    buildContextExtractionCommand(sessionRef, location, model) {
      // `sdk:` identifies Cursor's SDK-local Agent store, not a cursor-agent
      // CLI chat. Passing it to `cursor-agent --resume` can open the wrong
      // conversation or fail with an invalid session id.
      if (sessionRef.providerSessionId.startsWith(CURSOR_SDK_SESSION_PREFIX)) return undefined;
      const args = [
        "--print",
        "--force",
        "--trust",
        `--resume=${sessionRef.providerSessionId}`,
        "--output-format",
        "json",
      ];
      if (model && model !== "auto") {
        args.push("--model", model);
      }
      const spec = buildCursorArgvSpec(location, args);
      return { command: spec.binary, args: spec.args, ...(spec.env ? { env: spec.env } : {}) };
    },
  };
}
