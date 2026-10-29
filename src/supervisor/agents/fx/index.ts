import { createAcpStructuredSession } from "../acp";
import {
  assertOneShotControlsMapped,
  bracketedPasteDirectInput,
  detectAgentInstall,
  detectProbeLocation,
  inheritBaseSpawnEnv,
  prepareAgentLocationEnvironment,
  programStatusOscHint,
  resolveCheckedOneShotBuilderSelection,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import {
  createFxAcpSessionUpdateTransform,
  FX_ACP_FAST_CONFIG_BINDING,
  FX_ACP_PROMPT_STEERING,
  normalizeFxAcpConfigOptions,
  normalizeFxPermissionRequest,
  resolveFxAcpMode,
} from "./acp";
import { fxContextNoticeExtension } from "./acpContextNotices";
import { buildFxArgs, buildFxLaunchEnv, fxModelArgs } from "./argv";
import { manageFxCredentials } from "./credentials";
import { buildFxCommand, fxDefaultCapabilities, fxDetectionSpec } from "./detection";
import { fxNativeMcpConfig } from "./nativeMcp";
import { discoverFxSessionRef, snapshotFxPreSpawnSessions, watchFxSessionRef } from "./sessions";

export function createFxAdapter(): AgentAdapter {
  let capabilities = fxDefaultCapabilities;

  return {
    kind: fxDetectionSpec.kind,
    label: fxDetectionSpec.label,
    binary: fxDetectionSpec.binary,
    manageCredentials: manageFxCredentials,
    nativeMcpConfig: (ctx) => (ctx.envKind === "wsl" ? undefined : fxNativeMcpConfig()),
    skillSupport: {
      roots: [
        {
          id: "fx",
          label: fxDetectionSpec.label,
          globalPath: ".fx/skills",
          projectPath: ".fx/skills",
        },
        {
          id: "claude",
          label: "Claude-compatible skills",
          globalPath: ".claude/skills",
          projectPath: ".claude/skills",
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "dollar",
      precedence: {
        global: ["fx", "claude", "agents"],
        project: ["fx", "claude", "agents"],
      },
    },
    ...(fxDetectionSpec.update ? { update: fxDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // WSL auth prints a URL instead of opening a Windows browser from the distro.
    spawnEnv: { wsl: { FX_NO_OPEN_BROWSER: "1" } },
    ...inheritBaseSpawnEnv(fxDetectionSpec),

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, fxDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    async buildLaunchArgv(location, config, _prompt, sessionRef) {
      const id = sessionRef?.providerSessionId;
      // fx only writes a session once the first prompt starts, so record the
      // pre-launch workspace sessions for discoverSessionRef to diff against.
      if (!id) await snapshotFxPreSpawnSessions(location);
      return { binary: "fx", args: buildFxArgs(config, id), env: buildFxLaunchEnv(config) };
    },

    async buildResumeArgv(_location, config, _prompt, sessionRef) {
      return {
        binary: "fx",
        args: buildFxArgs(config, sessionRef.providerSessionId),
        env: buildFxLaunchEnv(config),
      };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      await prepareAgentLocationEnvironment(input.projectLocation);
      // FX_PERMISSION_MODE at spawn makes the agent's currentModeId match, so
      // Poracode does not call set_mode at open: fx's set_mode also persists
      // the mode into the user's ~/.fx/settings.json.
      const command = buildFxCommand(
        input.projectLocation,
        ["acp"],
        resolveAgentBinaryPath(input.projectLocation, "fx"),
        buildFxLaunchEnv(input.config),
      );
      return createAcpStructuredSession(
        command,
        {
          ...input,
          acpConfigOptionsNormalizer: normalizeFxAcpConfigOptions,
          acpSessionUpdateTransform: createFxAcpSessionUpdateTransform(),
        },
        {
          resolveMode: resolveFxAcpMode,
          permissionRequestTransform: normalizeFxPermissionRequest,
          promptSteering: FX_ACP_PROMPT_STEERING,
          behavior: { fastConfigBinding: FX_ACP_FAST_CONFIG_BINDING },
          textStreamExtension: fxContextNoticeExtension,
        },
      );
    },

    async buildAcpLogoutCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      await prepareAgentLocationEnvironment(location, { signal: ctx?.signal });
      return buildFxCommand(location, ["logout"], resolveAgentBinaryPath(location, "fx"));
    },

    createInitialSessionRef() {
      return undefined;
    },

    initialSessionRefDiscoveryDelayMs: 1500,
    discoverSessionRef: discoverFxSessionRef,
    watchSessionRef: watchFxSessionRef,

    // fx has no prompt positional: the first prompt is typed into the TUI.
    shouldDeferPromptToTerminal() {
      return true;
    },
    isReadyForInitialPrompt(text) {
      return /Run \/help for commands|session resumed:|\b(?:ask|auto|full access) · \S/i.test(text);
    },
    buildDirectInput: bracketedPasteDirectInput,

    detectInvalidSessionRef(text) {
      return /saved session not found/i.test(text);
    },

    // OSC 7501 Program Status is the authoritative working/idle signal; a
    // silent thinking phase must not time the thread out.
    handleOscProgramStatus: programStatusOscHint,
    workingSilenceTimeoutMs: null,

    allowsImplicitOneShotModel: true,
    buildOneShotCommand(model, effort, prompt, _location, fast, oneShotOptions) {
      const selection = resolveCheckedOneShotBuilderSelection(
        { model, effort, fast },
        oneShotOptions,
      );
      assertOneShotControlsMapped(selection, { effort: true, fast: true });
      if (!prompt) return undefined;
      return {
        command: "fx",
        args: ["ask", "--no-save", ...fxModelArgs({ model, effort, fast })],
        stdin: prompt,
        // Utility one-shots must never run with full access.
        env: { FX_PERMISSION_MODE: "ask" },
      };
    },
  };
}
