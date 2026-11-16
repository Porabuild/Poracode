import {
  createAcpStructuredSession,
  createSharedAcpStructuredSession,
  shutdownSharedAcpProcesses,
  type AcpSessionBehavior,
} from "../acp";
import {
  detectAgentInstall,
  prepareAgentLocationEnvironment,
  type AgentAdapter,
  type Awaitable,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildDeepSeekCommand } from "./argv";
import { deepSeekDefaultCapabilities, deepSeekDetectionSpec } from "./detection";
import { runDeepSeekOneShot } from "./oneShot";
import {
  createDeepSeekPolicyHome,
  createDeepSeekSessionPolicyWriter,
  normalizeDeepSeekConfig,
  stageDeepSeekPolicyFiles,
} from "./permissions";
import { manageDeepSeekModelProviders } from "./modelProviders";
import { deepSeekGoalExtension } from "./goals";

export const DEEPSEEK_ACP_SESSION_BEHAVIOR: AcpSessionBehavior = {
  // Harness advertises images for its initial route, which can differ from
  // the selected Account route. Keep attachments accessible as file links.
  inlineImagePrompts: false,
};

export function createDeepSeekAdapter(): AgentAdapter {
  let capabilities = deepSeekDefaultCapabilities;
  const policyHome = createDeepSeekPolicyHome();
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
    shutdown: () => shutdownSharedAcpProcesses(deepSeekDetectionSpec.kind),
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
      const location = input.projectLocation;
      // Native threads share one refcounted policy directory so pooled `dsh`
      // processes launch with an identical `--patch` path; each session still
      // gets its own `session-<id>.json`. WSL keeps a dedicated directory per
      // thread because its launch already stays off the shared pool.
      const files: { directory: string; patchPath: string; release(): Awaitable<void> } =
        location.kind === "wsl"
          ? await stageDeepSeekPolicyFiles(location).then((staged) => ({
              directory: staged.directory,
              patchPath: staged.patchPath,
              release: staged.cleanup,
            }))
          : await policyHome.acquire(location);
      try {
        const command = buildDeepSeekCommand(
          location,
          resolveAgentBinaryPath(location, "dsh"),
          files.patchPath,
        );
        const overrides = {
          behavior: DEEPSEEK_ACP_SESSION_BEHAVIOR,
          textStreamExtension: deepSeekGoalExtension,
        };
        const session =
          location.kind === "wsl"
            ? createAcpStructuredSession(command, input, overrides)
            : await createSharedAcpStructuredSession(
                command,
                input,
                { scope: deepSeekDetectionSpec.kind },
                overrides,
              );
        if (!session) {
          await files.release();
          return undefined;
        }
        const policies = createDeepSeekSessionPolicyWriter(location, files.directory);
        const dispose = session.dispose.bind(session);
        const openThread = session.openThread.bind(session);
        const startTurn = session.startTurn.bind(session);
        const interruptTurn = session.interruptTurn.bind(session);
        let generation = 0;
        let disposed = false;
        let turns = Promise.resolve();
        session.openThread = async (config, sessionRef) => {
          const normalized = normalizeDeepSeekConfig(config);
          if (sessionRef) {
            // Pin a resumed session's policy before dsh's resume hooks run.
            await policies.write(sessionRef.providerSessionId, normalized);
          }
          const id = await openThread(normalized, sessionRef);
          await policies.write(id, normalized);
          return id;
        };
        session.startTurn = (...args) => {
          const admittedGeneration = generation;
          const turn = turns.then(async () => {
            if (disposed || generation !== admittedGeneration) return;
            args[1] = normalizeDeepSeekConfig(args[1]);
            const sessionId = session.getSessionRef?.()?.providerSessionId;
            if (sessionId) await policies.write(sessionId, args[1]);
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
          try {
            await dispose();
            await turns;
          } finally {
            await policies.clear();
            await files.release();
          }
        };
        return session;
      } catch (error) {
        await files.release();
        throw error;
      }
    },
  };
}
