import { randomUUID } from "node:crypto";
import type { ProjectLocation, PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import { createAcpStructuredSession } from "../acp";
import {
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildQwenArgs, QWEN_DEFAULT_MODEL_ID } from "./argv";
import { createQwenAcpSessionBridge } from "./acpTransform";
import {
  buildQwenAcpSessionArgs,
  buildQwenCommand,
  qwenDefaultCapabilities,
  qwenDetectionSpec,
} from "./detection";
import { detectQwenInvalidSessionRef } from "./session";

export { detectQwenInvalidSessionRef } from "./session";

function qwenEnvironmentKey(location: ProjectLocation): string {
  return location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
}

function qwenDetectionEnvironmentKey(ctx: AgentEnvContext | undefined): string {
  if (ctx?.envKind === "wsl") return `wsl:${ctx.wslDistro ?? ""}`;
  return ctx?.envKind ?? (process.platform === "win32" ? "windows" : "posix");
}

export function createQwenAdapter(): AgentAdapter {
  let capabilities = qwenDefaultCapabilities;
  const detectedVersions = new Map<string, string | undefined>();
  const detectionGenerations = new Map<string, number>();
  let nextDetectionGeneration = 0;

  return {
    kind: qwenDetectionSpec.kind,
    label: qwenDetectionSpec.label,
    binary: qwenDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "qwen",
          label: qwenDetectionSpec.label,
          globalPath: ".qwen/skills",
          projectPath: ".qwen/skills",
          globalOverride: { env: "QWEN_HOME", path: "skills" },
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
        global: ["qwen", "agents"],
        project: ["qwen", "agents"],
      },
    },
    ...(qwenDetectionSpec.update ? { update: qwenDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },

    async detectInstall(ctx) {
      const environmentKey = qwenDetectionEnvironmentKey(ctx);
      const detectionGeneration = ++nextDetectionGeneration;
      detectionGenerations.set(environmentKey, detectionGeneration);
      detectedVersions.delete(environmentKey);
      try {
        const status = await detectAgentInstall(ctx, qwenDetectionSpec);
        capabilities = status.capabilities;
        if (detectionGenerations.get(environmentKey) === detectionGeneration) {
          detectedVersions.set(environmentKey, status.version);
        }
        return status;
      } catch (error) {
        if (detectionGenerations.get(environmentKey) === detectionGeneration) {
          detectedVersions.delete(environmentKey);
        }
        throw error;
      }
    },

    buildLaunchArgv(_location, config, prompt) {
      const sessionId = randomUUID();
      return {
        binary: "qwen",
        args: buildQwenArgs(config, prompt, undefined, sessionId),
        sessionRef: createKnownSessionRef(sessionId),
      };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      return {
        binary: "qwen",
        args: buildQwenArgs(config, prompt, sessionRef.providerSessionId),
      };
    },

    async createStructuredSession(input: CreateStructuredSessionInput) {
      const acpBridge = createQwenAcpSessionBridge();
      const command = buildQwenCommand(
        input.projectLocation,
        buildQwenAcpSessionArgs(detectedVersions.get(qwenEnvironmentKey(input.projectLocation))),
        resolveAgentBinaryPath(input.projectLocation, "qwen"),
      );
      return createAcpStructuredSession(command, {
        ...input,
        acpInitializeMeta: acpBridge.initializeMeta,
        acpSessionUpdateTransform: acpBridge.sessionUpdateTransform,
        acpExtensionSessionUpdateTransform: acpBridge.extensionSessionUpdateTransform,
      });
    },

    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildQwenCommand(location, ["--acp"], resolveAgentBinaryPath(location, "qwen"));
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

    handleOscNotification: iterm2ProgressOscHint,
    spoofsIterm2StatusEnv: true,
    optimisticWorkingOnSubmit: true,
    detectInvalidSessionRef: detectQwenInvalidSessionRef,

    defaultOneShotModel: QWEN_DEFAULT_MODEL_ID,

    buildOneShotCommand(model, _effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "qwen",
        args: ["-p", prompt, "--model", model || QWEN_DEFAULT_MODEL_ID, "--approval-mode", "plan"],
        stdin: "",
      };
    },

    buildContextExtractionCommand(sessionRef, _location, model) {
      return {
        command: "qwen",
        args: [
          "-p",
          EXTRACTION_PROMPT,
          "--resume",
          sessionRef.providerSessionId,
          "--model",
          model ?? QWEN_DEFAULT_MODEL_ID,
          "--approval-mode",
          "plan",
        ],
        stdin: "",
      };
    },
  };
}
