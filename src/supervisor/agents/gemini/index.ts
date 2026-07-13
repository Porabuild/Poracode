import { randomUUID } from "node:crypto";

import type { AgentCapability, ProjectLocation, PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import { createAcpStructuredSession } from "../acp";
import {
  buildAgentCommand,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  type AgentAdapter,
  type AgentEnvContext,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type TerminalStatusHint,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { buildGeminiArgs } from "./argv";
import { defaultGeminiCapabilities, geminiDetectionSpec } from "./detection";
import {
  createGeminiThreadSettingsFile,
  ensureGeminiLaunchSettingsFile,
  installGeminiPlugin,
  isGeminiPluginInstalled,
  readBundledGeminiPluginVersion,
  syncGeminiLaunchMcpSettings,
  uninstallGeminiPlugin,
} from "./plugin/install";
import { detectGeminiInvalidSessionRef } from "./session";
import { detectGeminiOscTitleStatus } from "./terminal";

export { detectGeminiInvalidSessionRef } from "./session";

const GEMINI_PLUGIN_VERSION = readBundledGeminiPluginVersion();

warnIfPluginManifestMissing("gemini", GEMINI_PLUGIN_VERSION);

function geminiHookActiveTerminalFallback(hint: TerminalStatusHint): boolean {
  return hint.status === "needs_reply" || hint.status === "needs_approval";
}

function geminiOscTitleHint(title: { text: string }): TerminalStatusHint | null {
  return detectGeminiOscTitleStatus(title.text);
}

/**
 * Minimal env context for resolving the staged Gemini `settings.json` path from
 * a terminal launch's `ProjectLocation`. The plugin base dir falls back to the
 * active channel (same as the CLI hook coordinator), so the thread settings
 * snapshot starts from the installed hook configuration.
 */
function geminiEnvContextForLocation(location: ProjectLocation): AgentEnvContext {
  const baseDir = process.env.PORACODE_DATA_DIR?.trim();
  return location.kind === "wsl"
    ? { envKind: "wsl", wslDistro: location.distro, ...(baseDir ? { baseDir } : {}) }
    : { envKind: location.kind, ...(baseDir ? { baseDir } : {}) };
}

function prepareGeminiLaunchMcpSettings(
  location: ProjectLocation,
  launchOptions: AgentLaunchOptions | undefined,
): { env: Record<string, string>; cleanup: () => void } | undefined {
  const ctx: AgentEnvContext = {
    ...geminiEnvContextForLocation(location),
    browserMcpEnabled: launchOptions?.browserMcp !== undefined,
    computerUseMcpEnabled: launchOptions?.computerUseMcp !== undefined,
    chromeMcpEnabled: launchOptions?.chromeMcp !== undefined,
    mcpServers: launchOptions?.mcpServers ?? [],
  };
  const createIfMissing =
    (launchOptions?.mcpServers?.length ?? 0) > 0 ||
    launchOptions?.browserMcp !== undefined ||
    launchOptions?.subagentMcp !== undefined ||
    launchOptions?.computerUseMcp !== undefined ||
    launchOptions?.chromeMcp !== undefined ||
    launchOptions?.appControlsMcp !== undefined;
  if (!ensureGeminiLaunchSettingsFile(ctx, createIfMissing)) return undefined;

  syncGeminiLaunchMcpSettings(ctx, {
    ...(launchOptions?.browserMcp ? { browserMcp: launchOptions.browserMcp } : {}),
    ...(launchOptions?.computerUseMcp ? { computerUseMcp: launchOptions.computerUseMcp } : {}),
    ...(launchOptions?.chromeMcp ? { chromeMcp: launchOptions.chromeMcp } : {}),
    ...(launchOptions?.subagentMcp ? { subagentMcp: launchOptions.subagentMcp } : {}),
    ...(launchOptions?.appControlsMcp ? { appControlsMcp: launchOptions.appControlsMcp } : {}),
  });
  const threadSettings = createGeminiThreadSettingsFile(ctx);
  if (!threadSettings) return undefined;
  return {
    env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: threadSettings.settingsPath },
    cleanup: threadSettings.cleanup,
  };
}

export function createGeminiAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultGeminiCapabilities;

  return {
    kind: geminiDetectionSpec.kind,
    label: geminiDetectionSpec.label,
    binary: geminiDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "gemini",
          label: geminiDetectionSpec.label,
          globalPath: ".gemini/skills",
          projectPath: ".gemini/skills",
          globalOverride: { env: "GEMINI_CLI_HOME", path: ".gemini/skills" },
        },
      ],
      invocation: "prompt",
      precedence: {
        global: ["agents", "gemini"],
        project: ["agents", "gemini"],
      },
    },
    ...(geminiDetectionSpec.update ? { update: geminiDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // Workspace trust is now suppressed via --skip-trust on every gemini
    // invocation (see buildGeminiArgs and the --acp launch below). WSL still
    // needs BROWSER=/bin/true so the OAuth flow does not try to xdg-open a
    // browser inside the distro and hang the PTY.
    spawnEnv: {
      wsl: { BROWSER: "/bin/true" },
    },
    pluginId: "poracode-status@gemini",
    pluginVersion: GEMINI_PLUGIN_VERSION,
    minProtocolVersion: 1,

    async isPluginSupported(ctx) {
      // Native: forward.mjs runs under Electron-as-Node via a wrapper.
      // WSL: hooks always supported; the runtime resolver probes the distro
      // for an existing node and falls back to installing the pinned LTS if
      // none is available. The actual install happens in `installPlugin`.
      void ctx;
      return true;
    },
    async isPluginInstalled(ctx) {
      return isGeminiPluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installGeminiPlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      uninstallGeminiPlugin(ctx);
    },
    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, geminiDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      const launchSettings = prepareGeminiLaunchMcpSettings(location, launchOptions);
      // Pre-assign the session UUID via --session-id so we know it before
      // spawn. Avoids racing post-spawn discovery against one-shot `gemini -p`
      // calls (title gen, commit-msg, PR summary) that also create entries in
      // --list-sessions and would otherwise be picked as "the new session".
      const assignedId = randomUUID();
      const args = buildGeminiArgs(config, prompt, undefined, assignedId);
      return {
        binary: "gemini",
        args,
        ...(launchSettings ? { env: launchSettings.env, cleanup: launchSettings.cleanup } : {}),
        sessionRef: createKnownSessionRef(assignedId),
      };
    },

    buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      const launchSettings = prepareGeminiLaunchMcpSettings(location, launchOptions);
      const args = buildGeminiArgs(config, prompt, sessionRef.providerSessionId);
      return {
        binary: "gemini",
        args,
        ...(launchSettings ? { env: launchSettings.env, cleanup: launchSettings.cleanup } : {}),
      };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      const command = buildAgentCommand(
        input.projectLocation,
        "gemini",
        ["--acp", "--skip-trust"],
        resolveAgentBinaryPath(input.projectLocation, "gemini"),
        input.projectLocation.kind === "windows" ? { GEMINI_PTY_INFO: "child_process" } : undefined,
      );
      return createAcpStructuredSession(command, input);
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildAgentCommand(
        location,
        "gemini",
        ["--acp", "--skip-trust"],
        resolveAgentBinaryPath(location, "gemini"),
        location.kind === "windows" ? { GEMINI_PTY_INFO: "child_process" } : undefined,
      );
    },

    createInitialSessionRef() {
      return undefined;
    },

    buildDirectInput(prompt) {
      // Gemini's TUI treats bulk writes as pastes. Newlines in pasted text
      // become input newlines instead of submit. Use empty spacer chunks to
      // add ~50ms delay between the text and the Enter key so the TUI
      // processes them as separate events (type → submit).
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      // Gemini CLI's @ handler doesn't expand ~ — always use full absolute paths.
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    handleOscNotification: iterm2ProgressOscHint,
    handleOscTitle: geminiOscTitleHint,
    spoofsIterm2StatusEnv: true,
    shouldApplyTerminalStatusWhileHookActive: geminiHookActiveTerminalFallback,
    detectInvalidSessionRef: detectGeminiInvalidSessionRef,

    defaultOneShotModel: "gemini-2.5-flash",

    buildOneShotCommand(model, _effort, prompt) {
      if (!prompt) return undefined;
      return { command: "gemini", args: ["-p", prompt, "--model", model], stdin: "" };
    },
    buildContextExtractionCommand(sessionRef, _location, model) {
      return {
        command: "gemini",
        args: [
          "-p",
          EXTRACTION_PROMPT,
          "--resume",
          sessionRef.providerSessionId,
          "--model",
          model ?? "gemini-2.5-flash",
        ],
        stdin: "",
      };
    },
  };
}
