import { createAcpStructuredSession } from "../acp";
import { detectAgentInstall, prepareAgentLocationEnvironment, type AgentAdapter } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildDeepSeekCommand } from "./argv";
import { deepSeekDefaultCapabilities, deepSeekDetectionSpec } from "./detection";
import { runDeepSeekOneShot } from "./oneShot";

export function createDeepSeekAdapter(): AgentAdapter {
  let capabilities = deepSeekDefaultCapabilities;
  return {
    kind: deepSeekDetectionSpec.kind,
    label: deepSeekDetectionSpec.label,
    binary: deepSeekDetectionSpec.binary,
    ...(deepSeekDetectionSpec.update ? { update: deepSeekDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    mcpRequiresStdioCwdProxy: true,
    get defaultOneShotModel() {
      return capabilities.models[0]!.id;
    },
    runOneShot: runDeepSeekOneShot,
    skillSupport: {
      roots: [
        {
          id: "dsh",
          label: "DeepSeek Harness",
          globalPath: ".dsh/skills",
          projectPath: ".dsh/skills",
          globalOverride: { env: "DSH_HOME", path: "skills" },
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
          globalOverride: { env: "DSH_AGENTS_HOME", path: "skills" },
        },
      ],
      invocation: "prompt",
      precedence: {
        scopeOrder: ["project", "global"],
        global: ["dsh", "agents"],
        project: ["dsh", "agents"],
      },
    },
    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, deepSeekDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },
    buildLaunchArgv() {
      throw new Error("DeepSeek Harness requires Chat presentation.");
    },
    buildResumeArgv() {
      throw new Error("DeepSeek Harness requires Chat presentation.");
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input) {
      await prepareAgentLocationEnvironment(input.projectLocation);
      const command = buildDeepSeekCommand(
        input.projectLocation,
        resolveAgentBinaryPath(input.projectLocation, "dsh"),
      );
      return createAcpStructuredSession(command, input);
    },
  };
}
