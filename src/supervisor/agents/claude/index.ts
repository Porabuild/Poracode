import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path, { posix as posixPath } from "node:path";

import type { AgentInstanceConfig, ProjectLocation, PromptSegment } from "@/shared/contracts";
import { claudeProfileKind, parseClaudeProfileInstanceConfig } from "@/shared/contracts";
import {
  brailleSpinnerOscTitleHint,
  buildAgentCommand,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  resolveWslHomeDirectory,
  shortenHomePath,
  type AgentAdapter,
  type CreateStructuredSessionInput,
  type DetectProbeCtx,
} from "../base";
import { buildClaudeArgs } from "./argv";
import { claudeCapabilities, claudeDetectionSpec, probeClaudeStatus } from "./detection";
import { probeClaudeCapabilities } from "./probe";
import { ClaudeSdkSession } from "./sdkSession";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import {
  getClaudePluginPaths,
  installClaudePlugin,
  isClaudePluginInstalled,
  readBundledClaudePluginVersion,
  uninstallClaudePlugin,
} from "./plugin/install";

// Semver comes only from plugin/plugin.json (forward.mjs reads that file too).
// Bump `MIN_PROTOCOL_VERSION` in src/shared/contracts/agentEvent.ts when the
// envelope shape changes.
const CLAUDE_PLUGIN_VERSION = readBundledClaudePluginVersion();

warnIfPluginManifestMissing("claude", CLAUDE_PLUGIN_VERSION);

interface ClaudeAdapterOptions {
  kind?: string;
  label?: string;
  configDir?: string;
}

function resolveTildePath(rawPath: string, location: ProjectLocation): string {
  const trimmed = rawPath.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) {
    return trimmed;
  }
  const suffix = trimmed === "~" ? "" : trimmed.slice(2);
  if (location.kind === "wsl") {
    const home = resolveWslHomeDirectory(location.distro);
    return home ? posixPath.join(home, suffix) : trimmed;
  }
  return path.join(homedir(), suffix);
}

function profileEnvForLocation(
  configDir: string | undefined,
  location: ProjectLocation,
): Record<string, string> | undefined {
  if (!configDir?.trim()) return undefined;
  return { CLAUDE_CONFIG_DIR: resolveTildePath(configDir, location) };
}

export function createClaudeProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const cfg = parseClaudeProfileInstanceConfig(instance.config);
  const profileLabel = instance.displayName ?? instance.id;
  return createClaudeAdapter({
    kind: claudeProfileKind(instance.id),
    label: `Claude ${profileLabel}`,
    configDir: cfg.configDir,
  });
}

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): AgentAdapter {
  const kind = options.kind ?? "claude";
  const label = options.label ?? "Claude Code";
  const profileEnv = (location: ProjectLocation) =>
    profileEnvForLocation(options.configDir, location);

  return {
    kind,
    label,
    binary: "claude",
    capabilities: claudeCapabilities,
    ...(claudeDetectionSpec.update ? { update: claudeDetectionSpec.update } : {}),
    // WSL OAuth flows try to open a browser; no-op it so the PTY doesn't hang.
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
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
    async uninstallPlugin(ctx) {
      uninstallClaudePlugin(ctx);
    },
    async pluginLaunchExtras(ctx) {
      const paths = getClaudePluginPaths(ctx);
      return { args: ["--settings", paths.settingsPath] };
    },
    async detectInstall(ctx) {
      const spec =
        options.configDir === undefined
          ? claudeDetectionSpec
          : {
              ...claudeDetectionSpec,
              kind,
              label,
              capabilities: claudeCapabilities,
              statusProbe: (probeCtx: DetectProbeCtx) => {
                const env = profileEnv(probeCtx.location);
                return probeClaudeStatus(probeCtx, env ? { env } : undefined);
              },
              capabilitiesProbe: (probeCtx: DetectProbeCtx) => {
                const env = profileEnv(probeCtx.location);
                return probeClaudeCapabilities(probeCtx, env ? { env } : undefined);
              },
            };
      const status = await detectAgentInstall(ctx, spec);
      return {
        ...status,
        kind,
        label,
        capabilities: status.capabilities,
      };
    },
    buildLaunchArgv(location, config, prompt, _sessionRef, _launchOptions) {
      const assignedId = randomUUID();
      const args = buildClaudeArgs(config, prompt, undefined, assignedId);
      const env = profileEnv(location);
      return {
        binary: "claude",
        args,
        ...(env ? { env } : {}),
        sessionRef: createKnownSessionRef(assignedId),
      };
    },
    buildResumeArgv(location, config, prompt, sessionRef, _launchOptions) {
      const args = buildClaudeArgs(config, prompt, sessionRef.providerSessionId);
      const env = profileEnv(location);
      return { binary: "claude", args, ...(env ? { env } : {}) };
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.presentationMode !== "gui") return undefined;
      const env = profileEnv(input.projectLocation);
      return ClaudeSdkSession.create({ ...input, ...(env ? { env } : {}) });
    },
    async buildAcpLogoutCommand(ctx) {
      const location = detectProbeLocation(ctx);
      return buildAgentCommand(
        location,
        "claude",
        ["auth", "logout"],
        undefined,
        profileEnv(location),
      );
    },
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
    buildOneShotCommand(model, effort, prompt, location) {
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
      const env = location ? profileEnv(location) : undefined;
      return {
        command: "claude",
        args,
        stdin: "",
        ...(env ? { env } : {}),
      };
    },
    buildContextExtractionCommand(sessionRef, location, model) {
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
      const env = profileEnv(location);
      return {
        command: "claude",
        args,
        ...(env ? { env } : {}),
      };
    },
  };
}
