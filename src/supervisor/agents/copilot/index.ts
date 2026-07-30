import { randomUUID } from "node:crypto";

import type { AgentInstanceConfig, ProjectLocation, PromptSegment } from "@/shared/contracts";
import { homeProfileKind, parseHomeProfileInstanceConfig } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { createAcpStructuredSession } from "../acp";
import {
  applyTerminalHintToConfig,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  shellExecOscHint,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
  type DetectionSpec,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { withTerminalAuthEnv } from "../homeProfile";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { buildCopilotArgs } from "./argv";
import { buildCopilotCommand, copilotDefaultCapabilities, copilotDetectionSpec } from "./detection";
import { writeCopilotMcpConfig } from "./mcp";
import {
  installCopilotPlugin,
  isCopilotPluginInstalled,
  readBundledCopilotPluginVersion,
  uninstallCopilotPlugin,
} from "./plugin/install";
import {
  detectCopilotInvalidSessionRef,
  detectCopilotTerminalStatus,
  READY_RE,
  resolveModelId,
} from "./terminal";
import {
  copilotProfileEnvForLocation,
  resolveCopilotHomeForLocation,
  resolveCopilotInstanceEnv,
} from "./profile";

export {
  detectCopilotInvalidSessionRef,
  detectCopilotModelEffort,
  detectCopilotStatusLineModel,
  detectCopilotTerminalStatus,
} from "./terminal";

const COPILOT_PLUGIN_VERSION = readBundledCopilotPluginVersion();

warnIfPluginManifestMissing(
  "copilot",
  COPILOT_PLUGIN_VERSION,
  "Expected at src/supervisor/agents/copilot/plugin/ (dev) or " +
    "resources/agent-plugins/copilot/ (packaged, staged by scripts/prepare-agent-plugins.mjs).",
);

interface CopilotAdapterOptions {
  kind?: string;
  label?: string;
  homeDir?: string;
  customEnv?: Record<string, string>;
}

export function createCopilotProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const config = parseHomeProfileInstanceConfig(instance.config);
  const customEnv = resolveCopilotInstanceEnv(instance.environment);
  return createCopilotAdapter({
    kind: homeProfileKind("copilot", instance.id),
    label: `GitHub Copilot ${instance.displayName ?? instance.id}`,
    homeDir: config.homeDir,
    ...(customEnv ? { customEnv } : {}),
  });
}

export function createCopilotAdapter(options: CopilotAdapterOptions = {}): AgentAdapter {
  let capabilities = copilotDefaultCapabilities;
  const kind = options.kind ?? copilotDetectionSpec.kind;
  const label = options.label ?? copilotDetectionSpec.label;
  const profileEnv = (location: ProjectLocation) =>
    copilotProfileEnvForLocation(options.homeDir, options.customEnv, location);
  const profileHome = (ctx?: AgentEnvContext) =>
    options.homeDir
      ? resolveCopilotHomeForLocation(options.homeDir, detectProbeLocation(ctx))
      : undefined;

  return {
    kind,
    label,
    binary: copilotDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "copilot",
          label,
          globalPath: ".copilot/skills",
          projectPath: ".github/skills",
          ...(options.homeDir ? { globalBasePath: options.homeDir } : {}),
          globalOverride: { env: "COPILOT_HOME", path: "skills" },
        },
        {
          id: "claude",
          label: "Claude-compatible skills",
          projectPath: ".claude/skills",
        },
        {
          // Copilot loads "Personal: ~/.agents/skills" and "Project:
          // .agents/skills" per the shipped binary's own help text.
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["copilot", "agents"],
        project: ["copilot", "agents", "claude"],
      },
    },
    ...(copilotDetectionSpec.update ? { update: copilotDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    async detectInstall(ctx) {
      const location = detectProbeLocation(ctx);
      const env = profileEnv(location);
      const spec: DetectionSpec = options.homeDir
        ? {
            ...copilotDetectionSpec,
            kind,
            label,
            ...(env ? { probeEnv: env } : {}),
            authProbes: [
              async () =>
                [
                  "COPILOT_GITHUB_TOKEN",
                  "COPILOT_API_TOKEN",
                  "GH_TOKEN",
                  "GITHUB_TOKEN",
                  "GH_ENTERPRISE_TOKEN",
                  "GITHUB_ENTERPRISE_TOKEN",
                ].some((name) => env?.[name]?.trim())
                  ? "authenticated"
                  : undefined,
            ],
          }
        : copilotDetectionSpec;
      const status = withTerminalAuthEnv(await detectAgentInstall(ctx, spec), env, {
        id: "copilot-terminal-login",
        name: "Login",
        type: "terminal",
      });
      capabilities = status.capabilities;
      return status;
    },
    // ── CLI hook plugin support ──────────────────────────────────────────
    pluginId: "poracode-status@copilot",
    pluginVersion: COPILOT_PLUGIN_VERSION,
    minProtocolVersion: 1,
    // Copilot CLI's hook event vocabulary lacks a clean turn-finished signal:
    // there's no `agentStop`, and `sessionEnd` only fires on full-session
    // termination. We let L1 events drive working/error transitions and keep
    // L2 OSC parsing running for the working->idle edge.
    partialL1: true,
    async isPluginInstalled(ctx) {
      return isCopilotPluginInstalled(ctx, profileHome(ctx));
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const home = profileHome(ctx);
      const result = installCopilotPlugin(ctx, {
        resolvedNodePath: node.nodePath,
        ...(home ? { globalCopilotDirOverride: home } : {}),
      });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      // Remove only this adapter's hook file. Staged assets are shared by the
      // base adapter and every profile and are inert without that hook file.
      uninstallCopilotPlugin(ctx, profileHome(ctx), false);
    },
    // No `pluginLaunchExtras` needed — Copilot CLI auto-loads
    // `${COPILOT_HOME ?? ~/.copilot}/hooks/poracode-status.json` written at
    // install time, and `PORACODE_HOOK_*` env is injected by the coordinator.
    buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      const sessionId = launchOptions?.resumeThreadId ?? randomUUID();
      const mcp = writeCopilotMcpConfig(location, sessionId, launchOptions?.mcpServers ?? []);
      const env = { ...(mcp?.env ?? {}), ...(profileEnv(location) ?? {}) };
      return {
        binary: "copilot",
        args: buildCopilotArgs(config, prompt, sessionId, launchOptions, mcp?.argument),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...(mcp ? { cleanup: mcp.cleanup } : {}),
        sessionRef: createKnownSessionRef(sessionId),
      };
    },
    buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      const sessionId = launchOptions?.resumeThreadId ?? sessionRef.providerSessionId;
      const mcp = writeCopilotMcpConfig(location, sessionId, launchOptions?.mcpServers ?? []);
      const env = { ...(mcp?.env ?? {}), ...(profileEnv(location) ?? {}) };
      return {
        binary: "copilot",
        args: buildCopilotArgs(config, prompt, sessionId, launchOptions, mcp?.argument),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...(mcp ? { cleanup: mcp.cleanup } : {}),
      };
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      // Resume/presentation gating lives in `createAcpStructuredSession` so
      // every ACP-speaking provider behaves identically — we just hand it the
      // command and let it decide whether to actually spawn.
      const args = ["--acp", "--stdio"];
      if (input.config.approvalPolicy === "never") {
        args.push("--yolo");
      }
      const command = buildCopilotCommand(
        input.projectLocation,
        args,
        resolveAgentBinaryPath(input.projectLocation, "copilot"),
        profileEnv(input.projectLocation),
      );
      return createAcpStructuredSession(command, input);
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildCopilotCommand(
        location,
        ["--acp", "--stdio"],
        resolveAgentBinaryPath(location, "copilot"),
        profileEnv(location),
      );
    },
    createInitialSessionRef() {
      return undefined;
    },
    buildDirectInput(prompt) {
      // Mode is set at launch via --plan / --mode. The TUI persists the
      // selection across turns, so subsequent prompts pass through as-is.
      return [prompt, "@wait:40", "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((segment) => segment.kind === "attachment");
      const rest = segments.filter((segment) => segment.kind !== "attachment");
      const attachmentLines = attachments.map((segment) => `@${segment.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    isReadyForInitialPrompt(text) {
      return READY_RE.test(text);
    },
    detectTerminalStatus(text) {
      const hint = detectCopilotTerminalStatus(text);
      if (hint?.model) {
        hint.model = resolveModelId(hint.model, capabilities.models);
      }
      return hint;
    },
    // Copilot CLI emits OSC 9;4 progress (iTerm2 protocol) — `4;3` while a
    // turn is in flight, `4;0` when it returns to idle. Same protocol Claude
    // uses; reuse helper.
    handleOscNotification: iterm2ProgressOscHint,
    // Copilot also emits OSC 133;C / 133;D shell-integration markers around
    // agent execution. Redundant with OSC 9;4 in most environments but the
    // primary signal in WSL where 9;4 is unreliable.
    handleOscShellEvent: shellExecOscHint,
    detectInvalidSessionRef(text) {
      return detectCopilotInvalidSessionRef(text);
    },
    syncConfigFromTerminalState: applyTerminalHintToConfig,
    defaultOneShotModel: "",
    buildOneShotCommand(model, effort, prompt, location) {
      if (!prompt) {
        return undefined;
      }

      const args = ["-p", prompt, "-s", "--allow-all-tools"];
      if (model) {
        args.push("--model", model);
      }
      if (effort) {
        args.push("--effort", effort);
      }

      const env = location ? profileEnv(location) : undefined;
      return { command: "copilot", args, stdin: "", ...(env ? { env } : {}) };
    },
    buildContextExtractionCommand(sessionRef, location, model) {
      // Copilot's -p flag takes the prompt inline as an arg.
      // The orchestrator pipes the extraction prompt via stdin,
      // so we pass a brief directive via -p and let stdin carry the full prompt.
      const args = [
        "-p",
        "Summarize this conversation for handoff to another AI assistant. Reply with only the summary.",
        `--resume=${sessionRef.providerSessionId}`,
        "-s",
        "--allow-all-tools",
      ];
      if (model) {
        args.push("--model", model);
      }
      const env = profileEnv(location);
      return { command: "copilot", args, stdin: "", ...(env ? { env } : {}) };
    },
  };
}
