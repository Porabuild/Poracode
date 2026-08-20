import type { AgentCapability, PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import {
  detectAgentInstall,
  type AgentAdapter,
  type TerminalStatusHint,
  inheritBaseSpawnEnv,
} from "../base";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { buildCommandCodeArgs } from "./argv";
import {
  COMMANDCODE_DEFAULT_MODEL_ID,
  commandCodeDetectionSpec,
  defaultCommandCodeCapabilities,
} from "./detection";
import {
  installCommandCodePlugin,
  isCommandCodePluginInstalled,
  readBundledCommandCodePluginVersion,
  uninstallCommandCodePlugin,
} from "./plugin/install";
import { detectCommandCodeInvalidSessionRef } from "./session";
import {
  isUuid,
  makeCommandCodeDiscoverSessionRef,
  makeCommandCodeWatchSessionRef,
  snapshotCommandCodePreSpawnSessions,
} from "./sessionFiles";
import { detectCommandCodeTerminalStatus } from "./terminal";

export { detectCommandCodeInvalidSessionRef } from "./session";

const COMMANDCODE_PLUGIN_VERSION = readBundledCommandCodePluginVersion();

warnIfPluginManifestMissing("commandcode", COMMANDCODE_PLUGIN_VERSION);

/**
 * Command Code's L1 `Stop` hook owns the authoritative working→idle edge, so
 * while a hook is active we only let the L2 terminal-text fallback surface
 * `working` (for follow-up text turns, which have no turn-start hook) and the
 * interactive `needs_approval` / `needs_reply` states (no hook event exists for
 * those). `idle` is suppressed here so a stale spinner frame can never beat the
 * `Stop` hook to the idle transition.
 */
function commandCodeHookActiveTerminalFallback(hint: TerminalStatusHint): boolean {
  return hint.status !== "idle";
}

export function createCommandCodeAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultCommandCodeCapabilities;

  return {
    kind: commandCodeDetectionSpec.kind,
    label: commandCodeDetectionSpec.label,
    binary: commandCodeDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "commandcode",
          label: commandCodeDetectionSpec.label,
          globalPath: ".commandcode/skills",
          projectPath: ".commandcode/skills",
        },
        {
          // Command Code scans `.agents/skills` alongside its own folder
          // (verified against the shipped binary's scan literals).
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["commandcode", "agents"],
        project: ["commandcode", "agents"],
      },
    },
    // Surface the update spec on the adapter (not just on the detection status)
    // so the shared updater and the npm "latest version" probe behind the
    // Settings registry card can read `adapter.update`. Mirrors every other
    // native adapter; without it the not-installed card shows no version.
    ...(commandCodeDetectionSpec.update ? { update: commandCodeDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // `command-code login` opens a browser for OAuth; BROWSER=/bin/true keeps
    // the WSL flow from trying to `xdg-open` inside the distro and hanging the
    // PTY (the user completes auth via the printed URL instead).
    spawnEnv: {
      wsl: { BROWSER: "/bin/true" },
    },
    // Disables the CLI's background self-updater so no lane can spawn a
    // detached `npm i` terminal window.
    ...inheritBaseSpawnEnv(commandCodeDetectionSpec),

    // ── CLI hook plugin support ──────────────────────────────────────────
    // Command Code emits no OSC; its Claude-compatible hook system is the only
    // stable working/idle signal. `Stop` → idle is authoritative (full L1, not
    // partialL1). Install is manual-only (the launch path never installs a
    // missing plugin) and the hooks live in the user's `~/.commandcode/
    // settings.json`, which the CLI auto-trusts.
    pluginId: "poracode-status@commandcode",
    pluginVersion: COMMANDCODE_PLUGIN_VERSION,
    minProtocolVersion: 1,
    async isPluginSupported() {
      // Native: forward.mjs runs under Electron-as-Node via a generated
      // wrapper. WSL: install resolves a distro node. Always supported.
      return true;
    },
    async isPluginInstalled(ctx) {
      return isCommandCodePluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installCommandCodePlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      uninstallCommandCodePlugin(ctx);
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, commandCodeDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt) {
      // `command-code` has no flag to pre-assign or report a session id, so we
      // snapshot the existing transcripts here and let the runtime discover the
      // real id afterward (discoverSessionRef below). Returning no sessionRef
      // is what enables that discovery path; resume then targets the exact id.
      const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
      snapshotCommandCodePreSpawnSessions(location, cwd);
      const args = buildCommandCodeArgs(config, prompt);
      return { binary: "command-code", args };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      // Resume the exact discovered session id (`--resume <id>`). A dead/stale
      // id surfaces command-code's "found to resume" error, which the runtime
      // recovers by relaunching fresh (see detectCommandCodeInvalidSessionRef)
      // — same contract as grok/codex. A non-UUID ref (legacy/degenerate) falls
      // back to `--continue`.
      const id = sessionRef?.providerSessionId;
      const args = buildCommandCodeArgs(config, prompt, id && isUuid(id) ? id : "");
      return { binary: "command-code", args };
    },

    createInitialSessionRef() {
      return undefined;
    },

    // `command-code` writes the transcript only on the first message, so poll a
    // beat after launch and rely on watchSessionRef to catch the file's
    // creation. Mirrors codex's discovery cadence.
    initialSessionRefDiscoveryDelayMs: 1000,
    discoverSessionRef: makeCommandCodeDiscoverSessionRef(),
    watchSessionRef: makeCommandCodeWatchSessionRef(),

    buildDirectInput(prompt) {
      // The TUI treats bulk writes as a paste, so an embedded `\r` becomes a
      // literal newline instead of submitting. Pause ~40ms between the text and
      // the Enter key so they arrive as separate events.
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    detectTerminalStatus: detectCommandCodeTerminalStatus,
    shouldApplyTerminalStatusWhileHookActive: commandCodeHookActiveTerminalFallback,
    // Command Code emits no turn-START hook (only PreToolUse/PostToolUse/Stop),
    // so a pure-text turn would otherwise show no `working`. Flip to working on
    // submit; the `Stop` hook returns it to idle.
    optimisticWorkingOnSubmit: true,
    detectInvalidSessionRef: detectCommandCodeInvalidSessionRef,

    defaultOneShotModel: COMMANDCODE_DEFAULT_MODEL_ID,

    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "command-code",
        args: [
          "--trust",
          "--skip-onboarding",
          "--no-session",
          "--model",
          model || COMMANDCODE_DEFAULT_MODEL_ID,
          ...(effort ? ["--effort", effort] : []),
          "-p",
          prompt,
        ],
        stdin: "",
      };
    },

    // Command Code has no structured (GUI) runtime, so it joins the subagent
    // roster via the one-shot child lane. `--trust` skips folder trust; `--yolo`
    // is the actual tool-permission bypass required because a one-shot child has
    // no interactive approval channel and must never block on input.
    buildSubagentOneShotCommand({ model, effort, prompt }) {
      return {
        command: "command-code",
        args: [
          "--trust",
          "--skip-onboarding",
          "--no-session",
          "--yolo",
          "--model",
          model || COMMANDCODE_DEFAULT_MODEL_ID,
          ...(effort ? ["--effort", effort] : []),
          "-p",
          prompt,
        ],
        stdin: "",
      };
    },
  };
}
