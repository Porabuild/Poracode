import { randomUUID } from "node:crypto";
import type { PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
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
import { createGrokAcpSessionUpdateTransform } from "./acpTransform";
import { buildGrokCommand, grokDefaultCapabilities, grokDetectionSpec } from "./detection";
import {
  installGrokPlugin,
  isGrokPluginInstalled,
  readBundledGrokPluginVersion,
  uninstallGrokPlugin,
} from "./plugin/install";
import {
  makeGrokDiscoverSessionRef,
  makeGrokWatchSessionRef,
  resolveGrokSessionArg,
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
    kind: grokDetectionSpec.kind,
    label: grokDetectionSpec.label,
    binary: grokDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "grok",
          label: grokDetectionSpec.label,
          globalPath: ".grok/skills",
          projectPath: ".grok/skills",
          globalOverride: { env: "GROK_HOME", path: "skills" },
        },
        {
          id: "claude",
          label: "Claude-compatible skills",
          globalPath: ".claude/skills",
          projectPath: ".claude/skills",
        },
        {
          // Grok "scans `.agents/skills/` at each tier (alongside `.grok/`)"
          // per the shipped binary's own help text.
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["grok", "agents", "claude"],
        project: ["grok", "agents", "claude"],
      },
    },
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

    buildGoalControlPrompt(control) {
      return control.action === "pause" || control.action === "resume" || control.action === "clear"
        ? `/goal ${control.action}`
        : undefined;
    },

    pluginId: "poracode-status@grok",
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
    async uninstallPlugin(ctx) {
      uninstallGrokPlugin(ctx);
    },
    // No `pluginLaunchExtras` env/args needed — Grok auto-loads
    // `~/.grok/hooks/poracode-status.json` written at install time, and
    // `PORACODE_HOOK_*` env is injected by the coordinator.
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
      // new UUID Grok creates if the pre-assigned `-s` id is ever ignored and
      // the PTY ends up creating its own session.
      snapshotGrokPreSpawnSessions(location, cwd);

      // Resolve the session ID before spawning the PTY: resume a known one
      // with `-r`, otherwise pre-assign a fresh UUID with `-s` (grok 0.2.118,
      // works on native and WSL alike). Grok normally materializes the
      // session dir within ~1s of boot; a known id whose dir never appeared
      // (launch died at startup) is re-assigned via `-s`
      // (see resolveGrokSessionArg).
      const known = sessionRef?.providerSessionId;
      const sessionId = known ?? randomUUID();
      const sessionArg = known
        ? resolveGrokSessionArg(location, cwd, known)
        : ({ kind: "new", sessionId } as const);

      const args = buildGrokArgs(config, prompt, sessionArg);
      // Returning the id as sessionRef lets the runtime skip post-spawn
      // discovery on the happy path (mirrors gemini/cursor).
      // discoverSessionRef stays wired up as the fallback.
      return {
        binary: "grok",
        args,
        sessionRef: createKnownSessionRef(sessionId),
      };
    },

    buildResumeArgv(location, config, prompt, sessionRef) {
      const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
      const known = sessionRef?.providerSessionId;
      const args = buildGrokArgs(
        config,
        prompt,
        known ? resolveGrokSessionArg(location, cwd, known) : undefined,
      );
      return { binary: "grok", args };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      const acpArgs = buildGrokAcpArgs(input.config);
      const command = buildGrokCommand(
        input.projectLocation,
        [...acpArgs, "agent", "stdio"],
        resolveAgentBinaryPath(input.projectLocation, "grok"),
      );
      return createAcpStructuredSession(command, {
        ...input,
        // Grok ACP proxies ReadFile through the client, including SKILL.md
        // loads from ~/.grok/bundled/skills and ~/.grok/skills. Without a
        // home-dir carve-out the shared fs bridge rejects those paths as
        // outside the project and every global/bundled skill fails.
        acpFsAgentHomeDirs: [".grok"],
        acpSessionUpdateTransform: createGrokAcpSessionUpdateTransform(),
      });
    },

    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildGrokCommand(
        location,
        ["--no-auto-update", "agent", "stdio"],
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
      // 0.2.x composer footer ("Shift+Tab:mode") — present on both the
      // welcome screen and resumed sessions (verified live on 0.2.118).
      if (t.includes("shift+tab")) return true;
      return false;
    },

    formatPromptSegments(segments: PromptSegment[]) {
      // Grok supports @path style file references in prompts (similar to others).
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    // Grok's TUI has no CLI flag for an initial interactive prompt — the only
    // headless prompt path is `grok -p` (non-interactive). Defer the prompt to
    // the PTY: the runtime queues it as `pendingTerminalPrompt` and types it
    // via `buildDirectInput` once `isReadyForInitialPrompt` fires.
    shouldDeferPromptToTerminal() {
      return true;
    },

    // One-shot (title / commit) generation reuses Grok's documented headless
    // path: `grok -p <prompt>`. `--always-approve` keeps the non-interactive run
    // from blocking on a tool-approval prompt it cannot answer (mirrors the
    // launch/ACP bypass in argv.ts). Grok 0.2.118 advertises grok-4.5 as its
    // supported model, so utility runs use the same live catalog entry.
    defaultOneShotModel: "grok-4.5",
    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      const args = ["--no-auto-update", "-p", prompt];
      if (model) args.push("-m", model);
      if (effort) args.push("--reasoning-effort", effort);
      args.push("--always-approve");
      return { command: "grok", args, stdin: "" };
    },
  };
}
