import type { AgentCapability, PromptSegment } from "@/shared/contracts";
import { isOpenCodeBrowserMcpEnabled } from "@/shared/opencodeSettings";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import {
  createKnownSessionRef,
  detectAgentInstall,
  shortenHomePath,
  type AgentAdapter,
  type CreateStructuredSessionInput,
  type RunOneShotInput,
  type TerminalStatusHint,
} from "../base";
import { warnIfPluginManifestMissing } from "../plugin/installerBase";
import { buildOpenCodeArgs } from "./argv";
import { opencodeDefaultCapabilities, opencodeDetectionSpec } from "./detection";
import { OpencodeSdkSession } from "./sdkSession";
import {
  installOpenCodePlugin,
  isOpenCodePluginInstalled,
  readBundledOpenCodePluginVersion,
  syncOpenCodeBrowserMcpConfigFile,
  uninstallOpenCodePlugin,
} from "./plugin/install";
import { runOpenCodeOneShot } from "./sdkOneShot";
import { detectOpenCodeTerminalStatus, opencodeOscHint, opencodeOscTitleHint } from "./terminal";

const OPENCODE_PLUGIN_VERSION = readBundledOpenCodePluginVersion();

// Default model for one-shot calls (commit / title gen, context extraction).
// `big-pickle` is OpenCode's free always-on house model — every other model
// in `opencode models` requires the user to have configured a paid provider,
// so it's the only safe out-of-the-box default. Renderer keeps its own
// constant; the two bundles can't share runtime symbols.
const OPENCODE_DEFAULT_ONE_SHOT_MODEL = "opencode/big-pickle";

warnIfPluginManifestMissing(
  "opencode",
  OPENCODE_PLUGIN_VERSION,
  "Expected at src/supervisor/agents/opencode/plugin/ (dev) or " +
    "resources/agent-plugins/opencode/ (packaged, staged by scripts/prepare-agent-plugins.mjs).",
);

// Only allow text-derived `needs_approval` signals through while L1 is active —
// those can race ahead of the `permission.asked` hook on slow ingress paths and
// the cost of a duplicate transition is zero.
function opencodeHookActiveTerminalFallback(hint: TerminalStatusHint): boolean {
  return hint.status === "needs_approval";
}

export function createOpenCodeAdapter(): AgentAdapter {
  let capabilities: AgentCapability = opencodeDefaultCapabilities;

  return {
    kind: "opencode",
    label: "OpenCode",
    binary: "opencode",
    ...(opencodeDetectionSpec.update ? { update: opencodeDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },

    // ── CLI hook plugin support ──────────────────────────────────────────
    pluginId: "lightcode-status@opencode",
    pluginVersion: OPENCODE_PLUGIN_VERSION,
    minProtocolVersion: 1,
    async isPluginSupported(ctx) {
      // OpenCode auto-loads any `.mjs` file in its plugins dir on every
      // launch (per https://opencode.ai/docs/plugins). No version gate, no
      // platform restriction.
      void ctx;
      return true;
    },
    async isPluginInstalled(ctx) {
      return isOpenCodePluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      // No node resolution needed — OpenCode runs the plugin under its own
      // runtime. Missing-distro WSL contexts are caught downstream by
      // `resolveOpenCodeWslPluginsDir → undefined`.
      return installOpenCodePlugin(ctx);
    },
    async uninstallPlugin(ctx) {
      uninstallOpenCodePlugin(ctx);
    },
    async pluginLaunchExtras() {
      // Plugin is auto-loaded from the plugins/ directory; no CLI flag or
      // env override is needed. LIGHTCODE_HOOK_URL et al are injected by the
      // cli-hook coordinator regardless of what we return.
      return {};
    },

    // ── Detection ────────────────────────────────────────────────────────
    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, opencodeDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    // ── Launch / resume ──────────────────────────────────────────────────
    //
    // Session ID allocation: see `createStructuredSession` below. On a fresh
    // launch the runtime spins up `opencode acp`, calls `session/new`, captures
    // the resulting `ses_xxx` id, sets `launchOptions.resumeThreadId`, and then
    // disposes the ACP connection (because `liveInputMode === "terminal"`).
    // The TUI process below picks up the pre-allocated id via `--session <id>`,
    // so the supervisor knows the providerSessionId synchronously instead of
    // polling `opencode session list` after spawn.
    buildLaunchArgv(_location, config, prompt, _sessionRef, launchOptions) {
      syncOpenCodeBrowserMcpConfigFile(
        _location,
        isOpenCodeBrowserMcpEnabled(launchOptions?.agentSettings),
        launchOptions?.browserMcp,
        config.computerUse === true,
        launchOptions?.computerUseMcp,
      );
      const sessionId = launchOptions?.resumeThreadId;
      const args = buildOpenCodeArgs(config, prompt, sessionId);
      return {
        binary: "opencode",
        args,
        ...(sessionId ? { sessionRef: createKnownSessionRef(sessionId) } : {}),
      };
    },
    buildResumeArgv(_location, config, prompt, sessionRef, launchOptions) {
      syncOpenCodeBrowserMcpConfigFile(
        _location,
        isOpenCodeBrowserMcpEnabled(launchOptions?.agentSettings),
        launchOptions?.browserMcp,
        config.computerUse === true,
        launchOptions?.computerUseMcp,
      );
      return {
        binary: "opencode",
        args: buildOpenCodeArgs(config, prompt, sessionRef.providerSessionId),
      };
    },
    createInitialSessionRef() {
      return undefined;
    },

    // ── Structured session (SDK-backed for both modes) ──────────────────
    //
    // Terminal mode (default): runtime calls `activate()` + `openThread()`,
    // captures the returned session id into `launchOptions.resumeThreadId`,
    // then disposes immediately because `liveInputMode === "terminal"`. The
    // ephemeral `opencode serve` process exits; the TUI launches with
    // `--session <id>` and resumes from SQLite. Same observable behaviour as
    // the previous `opencode acp` allocation, just over HTTP+SDK so we share
    // infrastructure with the GUI flow.
    //
    // GUI mode: same handle stays alive for the thread's lifetime; SSE
    // events stream through `sdkCanonicalMapping` into chat items.
    async createStructuredSession(input: CreateStructuredSessionInput) {
      // Terminal-mode resume: the TUI re-attaches via `--session <id>` from
      // SQLite, so we don't need a live SDK session. Skip the spawn entirely.
      const isResume = input.sessionRef !== undefined;
      const isTerminal = input.presentationMode !== "gui";
      if (isResume && isTerminal) return undefined;
      return OpencodeSdkSession.create(input);
    },

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
      const restStr = rest
        .map((segment) => (segment.kind === "file" ? `@${segment.path}` : segment.content))
        .join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },

    // OpenCode's TUI silently ignores `--prompt` when `--session <id>` is
    // also present (verified empirically against opencode 1.14.30: the prompt
    // text never lands in the session). Since we always pre-allocate the
    // session id via ACP for new threads, `--session` is *always* present —
    // so the launch-time prompt path is dead. Defer the initial prompt to the
    // PTY: the runtime queues it as `pendingTerminalPrompt` and types it via
    // `buildDirectInput` once the TUI is ready. Same pattern Codex uses for
    // plan mode.
    shouldDeferPromptToTerminal() {
      return true;
    },
    // Gate for flushing the deferred initial prompt. The runtime sets
    // `cliHookEnvInjected = true` for any agent whose hook plugin is
    // configured (which we are — the in-process plugin). That puts the
    // pipeline on the hook-fast-path immediately, where the L2 idle hint we
    // emit from `detectTerminalStatus` is bypassed. Instead, the fast path
    // calls `isReadyForInitialPrompt(strippedData)` on every PTY chunk and
    // only flushes the queued prompt once we say the input box is up.
    // Match the same keybind footer the idle hint uses — it's painted only
    // when the TUI accepts input.
    isReadyForInitialPrompt(text) {
      return /\btab\s*agents|\bctrl\+p\s*commands/i.test(text);
    },

    // ── L2 (terminal heuristics + OSC) ───────────────────────────────────
    detectTerminalStatus: detectOpenCodeTerminalStatus,
    handleOscNotification: opencodeOscHint,
    handleOscTitle: opencodeOscTitleHint,
    oscHintsDeferToHookPlugin: true,
    shouldApplyTerminalStatusWhileHookActive: opencodeHookActiveTerminalFallback,
    workingSilenceTimeoutMs: null,

    // ── One-shot (commit / title gen) ────────────────────────────────────
    //
    // Two paths:
    //   - `runOneShot` (preferred): goes through `opencode serve` over SDK,
    //     reusing the per-project server pool with a 30s idle TTL. Mirrors
    //     t3code's text-generation flow and avoids one CLI cold-start per
    //     generated commit/title/PR.
    //   - `buildOneShotCommand` (fallback): legacy `opencode run --format
    //     json` path. Kept so orchestrators that haven't migrated to the
    //     SDK-first runner still work, and so we have a CLI fallback for
    //     environments where `opencode serve` fails to start.
    defaultOneShotModel: OPENCODE_DEFAULT_ONE_SHOT_MODEL,
    async runOneShot(input: RunOneShotInput): Promise<string> {
      return runOpenCodeOneShot(input);
    },
    buildOneShotCommand(model, _effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "opencode",
        args: ["run", "--format", "json", "--model", model, prompt],
        stdin: "",
      };
    },
    buildContextExtractionCommand(sessionRef, _location, model) {
      return {
        command: "opencode",
        args: [
          "run",
          "--session",
          sessionRef.providerSessionId,
          "--model",
          model ?? OPENCODE_DEFAULT_ONE_SHOT_MODEL,
          EXTRACTION_PROMPT,
        ],
        stdin: "",
      };
    },
  };
}
