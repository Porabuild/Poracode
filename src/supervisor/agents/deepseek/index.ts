import { createAcpStructuredSession, type AcpSessionBehavior } from "../acp";
import { detectAgentInstall, prepareAgentLocationEnvironment, type AgentAdapter } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildDeepSeekCommand } from "./argv";
import { deepSeekDefaultCapabilities, deepSeekDetectionSpec } from "./detection";
import { runDeepSeekOneShot } from "./oneShot";
import { normalizeDeepSeekConfig, stageDeepSeekPermissions } from "./permissions";
import { manageDeepSeekModelProviders } from "./modelProviders";
import { deepSeekGoalExtension } from "./goals";

export const DEEPSEEK_ACP_SESSION_BEHAVIOR: AcpSessionBehavior = {
  // Harness advertises images for its initial route, which can differ from
  // the selected Account route. Keep attachments accessible as file links.
  inlineImagePrompts: false,
};

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
    manageModelProviders: manageDeepSeekModelProviders,
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
      const staged = await stageDeepSeekPermissions(input.projectLocation, input.config);
      try {
        const command = buildDeepSeekCommand(
          input.projectLocation,
          resolveAgentBinaryPath(input.projectLocation, "dsh"),
          staged.patchPath,
        );
        const session = createAcpStructuredSession(command, input, {
          behavior: DEEPSEEK_ACP_SESSION_BEHAVIOR,
          textStreamExtension: deepSeekGoalExtension,
        });
        if (!session) {
          await staged.cleanup();
          return undefined;
        }
        const dispose = session.dispose.bind(session);
        const openThread = session.openThread.bind(session);
        const startTurn = session.startTurn.bind(session);
        const interruptTurn = session.interruptTurn.bind(session);
        let generation = 0;
        let disposed = false;
        let turns = Promise.resolve();
        session.openThread = (config, sessionRef) =>
          openThread(normalizeDeepSeekConfig(config), sessionRef);
        session.startTurn = (...args) => {
          const admittedGeneration = generation;
          const turn = turns.then(async () => {
            if (disposed || generation !== admittedGeneration) return;
            args[1] = normalizeDeepSeekConfig(args[1]);
            await staged.setConfig(args[1]);
            if (disposed || generation !== admittedGeneration) return;
            await startTurn(...args);
          });
          turns = turn.catch(() => {});
          return turn;
        };
        session.interruptTurn = () => {
          generation++;
          return interruptTurn();
        };
        session.dispose = async () => {
          disposed = true;
          generation++;
          await dispose();
          await turns;
          await staged.cleanup();
        };
        return session;
      } catch (error) {
        await staged.cleanup();
        throw error;
      }
    },
  };
}
