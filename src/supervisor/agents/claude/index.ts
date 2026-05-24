import { randomUUID } from "node:crypto";

import type { PromptSegment } from "@/shared/contracts";
import {
  brailleSpinnerOscTitleHint,
  buildAgentLogoutCommand,
  createKnownSessionRef,
  detectAgentInstall,
  iterm2ProgressOscHint,
  shortenHomePath,
  type AgentAdapter,
  type CreateStructuredSessionInput,
} from "../base";
import { buildClaudeArgs } from "./argv";
import { claudeCapabilities, claudeDetectionSpec } from "./detection";
import { ClaudeSdkSession } from "./sdkSession";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import {
  getClaudePluginPaths,
  installClaudePlugin,
  isClaudePluginInstalled,
  readBundledClaudePluginVersion,
} from "./plugin/install";

// Semver comes only from plugin/plugin.json (forward.mjs reads that file too).
// Bump `MIN_PROTOCOL_VERSION` in src/shared/contracts/agentEvent.ts when the
// envelope shape changes.
const CLAUDE_PLUGIN_VERSION = readBundledClaudePluginVersion();

warnIfPluginManifestMissing("claude", CLAUDE_PLUGIN_VERSION);

export function createClaudeAdapter(): AgentAdapter {
  return {
    kind: "claude",
    label: "Claude Code",
    binary: "claude",
    capabilities: claudeCapabilities,
    ...(claudeDetectionSpec.update ? { update: claudeDetectionSpec.update } : {}),
    // WSL OAuth flows try to open a browser; no-op it so the PTY doesn't hang.
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    detectInstall(ctx) {
      return detectAgentInstall(ctx, claudeDetectionSpec);
    },
    // ── CLI hook plugin support ──────────────────────────────────────────
    pluginId: "lightcode-status@claude",
    pluginVersion: CLAUDE_PLUGIN_VERSION,
    minProtocolVersion: 1,
    async isPluginSupported(ctx) {
      // Native: forward.mjs runs under Electron-as-Node via a generated
      // wrapper script — always supported.
      // WSL: hooks always supported; the runtime resolver probes the distro
      // for an existing node and falls back to installing the pinned LTS if
      // none is available. The actual install happens in `installPlugin`.
      void ctx;
      return true;
    },
    async isPluginInstalled(ctx) {
      return isClaudePluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installClaudePlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async pluginLaunchExtras(ctx) {
      const paths = getClaudePluginPaths(ctx);
      return { args: ["--settings", paths.settingsPath] };
    },
    buildLaunchArgv(_location, config, prompt, _sessionRef, _launchOptions) {
      const assignedId = randomUUID();
      const args = buildClaudeArgs(config, prompt, undefined, assignedId);
      return {
        binary: "claude",
        args,
        sessionRef: createKnownSessionRef(assignedId),
      };
    },
    buildResumeArgv(_location, config, prompt, sessionRef, _launchOptions) {
      const args = buildClaudeArgs(config, prompt, sessionRef.providerSessionId);
      return { binary: "claude", args };
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.presentationMode !== "gui") return undefined;
      return ClaudeSdkSession.create(input);
    },
    buildAcpLogoutCommand: buildAgentLogoutCommand("claude", ["auth", "logout"]),
    buildDirectInput(prompt, segments) {
      const attachmentCount = segments?.filter((s) => s.kind === "attachment").length ?? 0;
      const wait = attachmentCount > 0 ? 800 + (attachmentCount - 1) * 150 : 60;
      return [prompt, `@wait:${wait}`, "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      // Claude CLI natively handles @path for files and images — pass as @path inline.
      // Attachments are appended so the text prompt leads (better for title generation).
      // Shorten absolute home-dir paths to ~/... for a cleaner prompt line.
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${shortenHomePath(s.path)}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    handleOscNotification: iterm2ProgressOscHint,
    handleOscTitle: brailleSpinnerOscTitleHint,
    oscHintsDeferToHookPlugin: true,
    workingSilenceTimeoutMs: null,
    defaultOneShotModel: "haiku",
    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      // --no-session-persistence keeps title/commit/PR-summary calls out of
      // the `/resume` picker. --fallback-model auto-degrades to Haiku if the
      // primary is overloaded so async title generation does not silently
      // fail when the API throttles.
      const args = [
        "-p",
        prompt,
        "--model",
        model,
        "--fallback-model",
        "haiku",
        "--no-session-persistence",
      ];
      if (effort) {
        args.push("--effort", effort);
      }
      return { command: "claude", args, stdin: "" };
    },
    buildContextExtractionCommand(sessionRef, _location, model) {
      // The resumed session is read-only here; --no-session-persistence
      // prevents the extraction turn from being written back to disk.
      const args = [
        "-p",
        "--resume",
        sessionRef.providerSessionId,
        "--model",
        model ?? "haiku",
        "--no-session-persistence",
      ];
      return { command: "claude", args };
    },
  };
}
