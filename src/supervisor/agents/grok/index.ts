import type { PromptSegment } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import {
  brailleSpinnerOscTitleHint,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { buildGrokAcpArgs, buildGrokArgs } from "./argv";
import { buildGrokCommand, grokDefaultCapabilities, grokDetectionSpec } from "./detection";
import {
  installGrokPlugin,
  isGrokPluginInstalled,
  readBundledGrokPluginVersion,
} from "./plugin/install";
import {
  makeGrokDiscoverSessionRef,
  makeGrokWatchSessionRef,
  mintGrokSessionIdViaAcpSync,
  snapshotGrokPreSpawnSessions,
} from "./sessionFiles";

const GROK_PLUGIN_VERSION = readBundledGrokPluginVersion();

warnIfPluginManifestMissing("grok", GROK_PLUGIN_VERSION);

// Grok Build provider implementation.
// Docs: https://docs.x.ai/build/overview
// ACP:  https://docs.x.ai/build/cli/headless-scripting#acp
// Modes/permissions: https://docs.x.ai/build/modes-and-commands
// Enterprise auth:   https://docs.x.ai/build/enterprise

export function createGrokAdapter(): AgentAdapter {
  let capabilities = grokDefaultCapabilities;

  return {
    kind: "grok",
    label: "Grok Build",
    binary: "grok",
    ...(grokDetectionSpec.update ? { update: grokDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // WSL OAuth/login flows open a browser; neutralise so PTY does not hang.
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },

    // Grok emits a braille-spinner prefix in OSC 0 titles while a turn is
    // active ("⠴ - Waiting - grok") and clears back to plain "grok" when idle.
    // It also speaks the iTerm2 OSC 9;4 progress sub-protocol (state 0 = idle,
    // 1/3 = working). Kept as a redundant signal alongside the L1 hook plugin
    // — do not set oscHintsDeferToHookPlugin.
    handleOscNotification: iterm2ProgressOscHint,
    handleOscTitle: brailleSpinnerOscTitleHint,

    pluginId: "lightcode-status@grok",
    pluginVersion: GROK_PLUGIN_VERSION,
    minProtocolVersion: 1,

    async isPluginSupported() {
      return true;
    },
    async isPluginInstalled(ctx) {
      return isGrokPluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installGrokPlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    // No `pluginLaunchExtras` env/args needed — Grok auto-loads
    // `~/.grok/hooks/lightcode-status.json` written at install time, and
    // `LIGHTCODE_HOOK_*` env is injected by the coordinator.
    async pluginLaunchExtras() {
      return {};
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, grokDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt, sessionRef, _launchOptions) {
      const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
      // Snapshot existing session dirs so discoverSessionRef can identify the
      // new UUID Grok creates if minting fails and the PTY ends up creating
      // its own session.
      snapshotGrokPreSpawnSessions(location, cwd);

      // Resolve a session ID before spawning the PTY: prefer one we already
      // know (resume), otherwise mint one via a short-lived `grok agent stdio`
      // handshake so the TUI loads directly into the chat composer. Without
      // an ID Grok renders its welcome menu in cwds with prior sessions —
      // that breaks `isReadyForInitialPrompt` and the initial prompt never
      // gets delivered.
      let resumeId = sessionRef?.providerSessionId;
      if (!resumeId) {
        resumeId = mintGrokSessionIdViaAcpSync(location, 2600, buildGrokAcpArgs(config));
      }

      const args = buildGrokArgs(config, prompt, resumeId);
      // Returning the minted/resumed id as sessionRef lets the runtime skip
      // post-spawn discovery on the happy path (mirrors gemini/cursor).
      // discoverSessionRef stays wired up as the fallback for mint failures
      // in fresh cwds where Grok creates its own session.
      return {
        binary: "grok",
        args,
        ...(resumeId ? { sessionRef: createKnownSessionRef(resumeId) } : {}),
      };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      const args = buildGrokArgs(config, prompt, sessionRef?.providerSessionId);
      return { binary: "grok", args };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      const acpArgs = buildGrokAcpArgs(input.config);
      const command = buildGrokCommand(
        input.projectLocation,
        [...acpArgs, "agent", "stdio"],
        resolveAgentBinaryPath(input.projectLocation, "grok"),
      );
      return createAcpStructuredSession(command, input);
    },

    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildGrokCommand(
        location,
        ["agent", "stdio"],
        resolveAgentBinaryPath(location, "grok"),
      );
    },

    async buildAcpLogoutCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildGrokCommand(location, ["logout"], resolveAgentBinaryPath(location, "grok"));
    },

    createInitialSessionRef() {
      return undefined;
    },

    // After a PTY Grok launch we discover the real native session UUID that
    // Grok wrote to ~/.grok/sessions/<cwd>/<uuid>/ (the directory name is the
    // stable ID). Subsequent CLI resumes then use precise `-r <id>` and the
    // Chat (ACP) + Terminal tabs share the exact same Grok session.
    initialSessionRefDiscoveryDelayMs: 1200,
    discoverSessionRef: makeGrokDiscoverSessionRef(),
    watchSessionRef: makeGrokWatchSessionRef(),

    buildDirectInput(prompt) {
      // Grok TUI may batch pasted input (especially on fresh/resumed sessions);
      // space out the submit slightly so the composer treats it as typed text + enter.
      return [prompt, "@wait:120", "\r"];
    },

    isReadyForInitialPrompt(text) {
      const t = text.toLowerCase();
      if (t.includes("grok build")) return true;
      if (/type @|mention files|\/ commands/i.test(text)) return true;
      return false;
    },

    formatPromptSegments(segments: PromptSegment[]) {
      // Grok supports @path style file references in prompts (similar to others).
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    // Grok's TUI has no CLI flag for an initial interactive prompt — the only
    // headless prompt path is `grok -p` (non-interactive). Defer the prompt to
    // the PTY: the runtime queues it as `pendingTerminalPrompt` and types it
    // via `buildDirectInput` once `isReadyForInitialPrompt` fires.
    shouldDeferPromptToTerminal() {
      return true;
    },
  };
}
