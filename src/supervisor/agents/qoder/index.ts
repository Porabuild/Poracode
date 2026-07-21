import { randomUUID } from "node:crypto";
import type { PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import { createAcpStructuredSession } from "../acp";
import {
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import { buildQoderArgs, QODER_DEFAULT_MODEL_ID } from "./argv";
import { buildQoderCommand, qoderDefaultCapabilities, qoderDetectionSpec } from "./detection";
import {
  getQoderPluginPaths,
  installQoderPlugin,
  isQoderPluginInstalled,
  readBundledQoderPluginVersion,
  uninstallQoderPlugin,
} from "./plugin/install";
import { detectQoderInvalidSessionRef } from "./session";

export { detectQoderInvalidSessionRef } from "./session";

const QODER_PLUGIN_VERSION = readBundledQoderPluginVersion();

warnIfPluginManifestMissing("qoder", QODER_PLUGIN_VERSION);

export function createQoderAdapter(): AgentAdapter {
  let capabilities = qoderDefaultCapabilities;

  return {
    kind: qoderDetectionSpec.kind,
    label: qoderDetectionSpec.label,
    binary: qoderDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "qoder",
          label: qoderDetectionSpec.label,
          globalPath: ".qoder/skills",
          projectPath: ".qoder/skills",
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["qoder", "agents"],
        project: ["qoder", "agents"],
      },
    },
    ...(qoderDetectionSpec.update ? { update: qoderDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },

    // ── CLI hook plugin support ──────────────────────────────────────────
    pluginId: "poracode-status@qoder",
    pluginVersion: QODER_PLUGIN_VERSION,
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
      return isQoderPluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installQoderPlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      uninstallQoderPlugin(ctx);
    },
    async pluginLaunchExtras(ctx) {
      const paths = getQoderPluginPaths(ctx);
      return { args: ["--settings", paths.settingsPath] };
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, qoderDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(_location, config, prompt) {
      const sessionId = randomUUID();
      return {
        binary: "qodercli",
        args: buildQoderArgs(config, prompt, undefined, sessionId),
        sessionRef: createKnownSessionRef(sessionId),
      };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      return {
        binary: "qodercli",
        args: buildQoderArgs(config, prompt, sessionRef.providerSessionId),
      };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      const command = buildQoderCommand(
        input.projectLocation,
        ["--acp"],
        resolveAgentBinaryPath(input.projectLocation, "qodercli"),
      );
      return createAcpStructuredSession(command, input);
    },

    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildQoderCommand(location, ["--acp"], resolveAgentBinaryPath(location, "qodercli"));
    },

    createInitialSessionRef() {
      return undefined;
    },

    buildDirectInput(prompt) {
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((segment) => segment.kind === "attachment");
      const rest = segments.filter((segment) => segment.kind !== "attachment");
      const attachmentLines = attachments.map((segment) => `@${segment.path}`).join(" ");
      const restText = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restText}\n\n${attachmentLines} ` : restText;
    },

    optimisticWorkingOnSubmit: true,
    detectInvalidSessionRef: detectQoderInvalidSessionRef,

    defaultOneShotModel: QODER_DEFAULT_MODEL_ID,

    buildOneShotCommand(model, _effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "qodercli",
        args: [
          "-p",
          prompt,
          "--model",
          model || QODER_DEFAULT_MODEL_ID,
          "--permission-mode",
          "plan",
        ],
        stdin: "",
      };
    },

    buildContextExtractionCommand(sessionRef, _location, model) {
      return {
        command: "qodercli",
        args: [
          "-p",
          EXTRACTION_PROMPT,
          "--resume",
          sessionRef.providerSessionId,
          "--model",
          model || QODER_DEFAULT_MODEL_ID,
          "--permission-mode",
          "plan",
        ],
        stdin: "",
      };
    },
  };
}
