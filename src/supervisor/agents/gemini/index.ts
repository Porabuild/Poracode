import { randomUUID } from "node:crypto";
import { join, posix } from "node:path";

import type {
  AgentCapability,
  AgentInstanceConfig,
  ProjectLocation,
  PromptSegment,
} from "@/shared/contracts";
import { geminiProfileKind, parseGeminiProfileInstanceConfig } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { wslLinuxToHostFsPath } from "@/shared/wsl";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import { createAcpStructuredSession } from "../acp";
import {
  assertOneShotControlsMapped,
  resolveCheckedOneShotBuilderSelection,
  resolveCheckedOneShotResumeSelection,
  buildAgentCommand,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  prepareAgentLocationEnvironment,
  type AgentAdapter,
  type AgentEnvContext,
  type AgentLaunchOptions,
  type Awaitable,
  type CreateStructuredSessionInput,
  type StructuredSessionHandle,
  type TerminalStatusHint,
} from "../base";
import { resolveNativeTildePath } from "../base/sessionFs";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { resolveGeminiEmptyResponseError, resolveGeminiPromptErrorReason } from "./acpErrors";
import { createGeminiAcpSessionTransform, normalizeGeminiPermissionRequest } from "./acpTransform";
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
import { createGeminiProfileContext, type GeminiAdapterOptions } from "./profiles";
import { detectGeminiInvalidSessionRef, waitForGeminiResumeArtifact } from "./session";
import { createGeminiSessionImport } from "./sessionImport";
import { detectGeminiOscTitleStatus } from "./terminal";

export { detectGeminiInvalidSessionRef, waitForGeminiResumeArtifact } from "./session";

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

async function prepareGeminiLaunchMcpSettings(
  location: ProjectLocation,
  launchOptions: AgentLaunchOptions | undefined,
): Promise<{ env: Record<string, string>; cleanup: () => Awaitable<void> } | undefined> {
  const ctx: AgentEnvContext = {
    ...geminiEnvContextForLocation(location),
    mcpServers: launchOptions?.mcpServers ?? [],
  };
  const createIfMissing = (launchOptions?.mcpServers?.length ?? 0) > 0;
  if (!(await ensureGeminiLaunchSettingsFile(ctx, createIfMissing))) return undefined;

  await syncGeminiLaunchMcpSettings(ctx, launchOptions?.mcpServers ?? []);
  const threadSettings = await createGeminiThreadSettingsFile(ctx);
  if (!threadSettings) return undefined;
  return {
    env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: threadSettings.settingsPath },
    cleanup: threadSettings.cleanup,
  };
}

/**
 * A profile is a second Gemini CLI account or configuration: its own
 * `GEMINI_CLI_HOME` (credentials, settings, sessions, skills) with host-level
 * API-key/ADC/base-URL env vars blanked so profiles never silently run on host
 * credentials.
 */
export function createGeminiProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const cfg = parseGeminiProfileInstanceConfig(instance.config);
  const profileLabel = instance.displayName ?? instance.id;
  return createGeminiAdapter({
    kind: geminiProfileKind(instance.id),
    label: `Gemini ${profileLabel}`,
    profileId: instance.id,
    homeDir: cfg.homeDir,
  });
}

export function createGeminiAdapter(options: GeminiAdapterOptions = {}): AgentAdapter {
  let capabilities: AgentCapability = defaultGeminiCapabilities;
  const kind = options.kind ?? geminiDetectionSpec.kind;
  const label = options.label ?? geminiDetectionSpec.label;
  const nativeHomeDir =
    options.homeDir !== undefined ? resolveNativeTildePath(options.homeDir) : undefined;
  const { profileEnv, detectionSpec } = createGeminiProfileContext(options);

  return {
    kind,
    label,
    binary: geminiDetectionSpec.binary,
    sessionImport: createGeminiSessionImport(nativeHomeDir),
    skillSupport: {
      roots: [
        {
          id: "gemini",
          label,
          globalPath: ".gemini/skills",
          projectPath: ".gemini/skills",
          ...(options.homeDir ? { globalBasePath: options.homeDir } : {}),
          globalOverride: { env: "GEMINI_CLI_HOME", path: ".gemini/skills" },
        },
        {
          // Gemini CLI treats `.agents/skills` as a native alias at both
          // user and workspace scope.
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
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
      const result = await installGeminiPlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      await uninstallGeminiPlugin(ctx);
    },
    async detectInstall(ctx) {
      const location = detectProbeLocation(ctx);
      const env = await profileEnv(location);
      const status = await detectAgentInstall(
        ctx,
        env ? { ...detectionSpec, probeEnv: env } : detectionSpec,
      );
      capabilities = status.capabilities;
      return { ...status, kind, label };
    },

    async buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      const [launchSettings, env] = await Promise.all([
        prepareGeminiLaunchMcpSettings(location, launchOptions),
        profileEnv(location),
      ]);
      // Pre-assign the session UUID via --session-id so we know it before
      // spawn. Avoids racing post-spawn discovery against one-shot `gemini -p`
      // calls (title gen, commit-msg, PR summary) that also create entries in
      // --list-sessions and would otherwise be picked as "the new session".
      const assignedId = randomUUID();
      const args = buildGeminiArgs(config, prompt, undefined, assignedId);
      const mergedEnv =
        env || launchSettings?.env ? { ...(env ?? {}), ...(launchSettings?.env ?? {}) } : undefined;
      return {
        binary: "gemini",
        args,
        ...(mergedEnv ? { env: mergedEnv } : {}),
        ...(launchSettings?.cleanup ? { cleanup: launchSettings.cleanup } : {}),
        sessionRef: createKnownSessionRef(assignedId),
      };
    },

    async buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      const [launchSettings, env] = await Promise.all([
        prepareGeminiLaunchMcpSettings(location, launchOptions),
        profileEnv(location),
      ]);
      const args = buildGeminiArgs(config, prompt, sessionRef.providerSessionId);
      const mergedEnv =
        env || launchSettings?.env ? { ...(env ?? {}), ...(launchSettings?.env ?? {}) } : undefined;
      return {
        binary: "gemini",
        args,
        ...(mergedEnv ? { env: mergedEnv } : {}),
        ...(launchSettings?.cleanup ? { cleanup: launchSettings.cleanup } : {}),
      };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      await prepareAgentLocationEnvironment(input.projectLocation);
      const profEnv = await profileEnv(input.projectLocation);
      const profileConfigDir = profEnv?.GEMINI_CLI_HOME
        ? input.projectLocation.kind === "wsl"
          ? wslLinuxToHostFsPath(
              input.projectLocation.distro,
              posix.join(profEnv.GEMINI_CLI_HOME, ".gemini"),
            )
          : join(profEnv.GEMINI_CLI_HOME, ".gemini")
        : undefined;
      // Force non-interactive shell execution in ACP mode on all platforms:
      // Gemini CLI leaves `interactive=true` under `--acp`, and if
      // `enableInteractiveShell` is active its shell tool populates `ansiOutput`
      // arrays that `toToolCallContent` drops -> empty shell output.
      const commandEnv: Record<string, string> = {
        ...(profEnv ?? {}),
        GEMINI_PTY_INFO: "child_process",
        ...(input.env ?? {}),
      };
      const transformOptions = {
        projectLocation: input.projectLocation,
        ...(profileConfigDir ? { profileConfigDir } : {}),
      };
      const effectiveInput: CreateStructuredSessionInput = {
        ...input,
        env: commandEnv,
        acpSessionUpdateTransform: createGeminiAcpSessionTransform(transformOptions),
        acpEmptyResponseErrorResolver: resolveGeminiEmptyResponseError,
      };
      const command = buildAgentCommand(
        input.projectLocation,
        "gemini",
        ["--acp", "--skip-trust"],
        resolveAgentBinaryPath(input.projectLocation, "gemini"),
        commandEnv,
      );
      const session: StructuredSessionHandle | undefined = createAcpStructuredSession(
        command,
        effectiveInput,
        {
          promptErrorReason: resolveGeminiPromptErrorReason,
          permissionRequestTransform: (request) =>
            normalizeGeminiPermissionRequest(request, transformOptions),
          behavior: {
            promptUsageCounterKind: "per-call",
            promptUsageReportsContext: false,
          },
        },
      );
      if (!session) return undefined;

      session.ensureResumeArtifacts = async () => {
        const sessionId =
          session.getSessionRef?.()?.providerSessionId ?? input.sessionRef?.providerSessionId;
        if (!sessionId) return;
        await waitForGeminiResumeArtifact(sessionId, {
          projectLocation: input.projectLocation,
          env: {
            ...(effectiveInput.baseSpawnEnv ?? {}),
            ...(effectiveInput.env ?? {}),
          },
        });
      };
      return session;
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      await prepareAgentLocationEnvironment(location, { signal: ctx?.signal });
      const profEnv = await profileEnv(location);
      const env: Record<string, string> = {
        ...(profEnv ?? {}),
        GEMINI_PTY_INFO: "child_process",
      };
      return buildAgentCommand(
        location,
        "gemini",
        ["--acp", "--skip-trust"],
        resolveAgentBinaryPath(location, "gemini"),
        env,
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

    defaultOneShotModel: "gemini-3.8-flash",

    async buildOneShotCommand(model, effort, prompt, location, fast, oneShotOptions) {
      const selection = resolveCheckedOneShotBuilderSelection(
        { model, effort, fast },
        oneShotOptions,
      );
      // The gemini CLI maps neither effort nor Fast in this lane (no baseline
      // effort ladder; probes can add one, but this argv path has no flag for
      // either). The legacy default carriers stay accepted as declared-inactive
      // so default utility selections keep flowing; a meaningful control
      // refuses visibly instead of being silently dropped.
      assertOneShotControlsMapped(selection, {
        effort: { inactive: [""] },
        fast: { inactive: [false] },
      });
      if (!prompt) return undefined;
      const env = location ? await profileEnv(location) : undefined;
      return {
        command: "gemini",
        args: ["-p", prompt, "--model", model, "--skip-trust"],
        stdin: "",
        ...(env ? { env } : {}),
      };
    },
    async buildContextExtractionCommand(sessionRef, location, model, extractionOptions) {
      const selection = resolveCheckedOneShotResumeSelection(model, extractionOptions);
      // Same provider policy as the one-shot lane: only the model maps here,
      // so meaningful effort/Fast (and any thinking/context carrier) refuse
      // before the command is built.
      assertOneShotControlsMapped(selection, {
        effort: { inactive: [""] },
        fast: { inactive: [false] },
      });
      const env = await profileEnv(location);
      return {
        command: "gemini",
        args: [
          "-p",
          EXTRACTION_PROMPT,
          "--resume",
          sessionRef.providerSessionId,
          "--model",
          model ?? "gemini-3.8-flash",
          "--skip-trust",
        ],
        stdin: "",
        ...(env ? { env } : {}),
      };
    },
  };
}
