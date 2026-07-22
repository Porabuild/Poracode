import type { PromptSegment } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { detectAgentInstall, type AgentAdapter } from "../base";
import { buildPiArgs, buildPiOneShotArgs } from "./argv";
import { piDefaultCapabilities, piDetectionSpec } from "./detection";
import { PiRpcSession } from "./rpcSession";
import {
  discoverPiSessionRef,
  snapshotPiPreSpawnSessions,
  watchPiSessionRef,
} from "./sessionFiles";
import { detectPiTerminalStatus } from "./terminal";

export function createPiAdapter(): AgentAdapter {
  let capabilities = piDefaultCapabilities;

  return {
    kind: piDetectionSpec.kind,
    label: piDetectionSpec.label,
    binary: piDetectionSpec.binary,
    ...(piDetectionSpec.update ? { update: piDetectionSpec.update } : {}),
    skillSupport: {
      roots: [
        {
          id: "pi",
          label: piDetectionSpec.label,
          globalPath: ".pi/agent/skills",
          projectPath: ".pi/skills",
          globalOverride: { env: "PI_CODING_AGENT_DIR", path: "skills" },
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "skill",
      precedence: {
        global: ["pi", "agents"],
        project: ["pi", "agents"],
      },
    },
    get capabilities() {
      return capabilities;
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, piDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },

    buildLaunchArgv(location, config, prompt) {
      void snapshotPiPreSpawnSessions(location);
      return { binary: "pi", args: buildPiArgs(config, prompt) };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      return {
        binary: "pi",
        args: buildPiArgs(config, prompt, sessionRef.providerSessionId),
      };
    },

    async createStructuredSession(input) {
      if (input.presentationMode !== "gui") return undefined;
      return PiRpcSession.create(input);
    },

    createInitialSessionRef() {
      return undefined;
    },
    initialSessionRefDiscoveryDelayMs: 1_000,
    discoverSessionRef: discoverPiSessionRef,
    watchSessionRef: watchPiSessionRef,

    buildDirectInput(prompt) {
      return [prompt, "@wait:150", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((segment) => segment.kind === "attachment");
      const content = segments
        .filter((segment) => segment.kind !== "attachment")
        .map(inlinePromptSegmentText)
        .join("");
      const paths = attachments.map((segment) => `@${segment.path}`).join(" ");
      return paths ? `${content}\n\n${paths}` : content;
    },

    isReadyForInitialPrompt(text) {
      return /\bpi\b|\/\s+for\s+commands|ctrl-p\s+to\s+switch/i.test(text);
    },
    detectTerminalStatus: detectPiTerminalStatus,

    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "pi",
        args: buildPiOneShotArgs({ model, ...(effort ? { effort } : {}) }, prompt, {
          textOnly: true,
        }),
        stdin: "",
      };
    },

    buildTextOnlyOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      return {
        command: "pi",
        args: buildPiOneShotArgs({ model, ...(effort ? { effort } : {}) }, prompt, {
          textOnly: true,
        }),
        stdin: "",
      };
    },

    buildSubagentOneShotCommand(input) {
      return {
        command: "pi",
        args: buildPiOneShotArgs(
          { model: input.model, ...(input.effort ? { effort: input.effort } : {}) },
          input.prompt,
        ),
        stdin: "",
      };
    },
  };
}

export { piDefaultCapabilities, piDetectionSpec } from "./detection";
