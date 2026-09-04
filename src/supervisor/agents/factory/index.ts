import { createAcpStructuredSession } from "../acp";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { createAcpGenericAdapter } from "../acp-generic";
import {
  detectAgentInstall,
  detectProbeLocation,
  type AgentAdapter,
  type AgentEnvContext,
  type CreateStructuredSessionInput,
  inheritBaseSpawnEnv,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import {
  buildFactoryCommand,
  FACTORY_ACP_ARGS,
  factoryDefaultCapabilities,
  factoryDetectionSpec,
  normalizeFactoryModels,
} from "./detection";
import { attachFactorySubagentTranscripts } from "./subagentTranscripts";

export function createFactoryAcpRegistryAdapter(instance: AgentInstanceConfig): AgentAdapter {
  return createAcpGenericAdapter(instance, {
    normalizeProbeResult: (result) => ({
      ...result,
      ...(result.models ? { models: normalizeFactoryModels(result.models) } : {}),
    }),
  });
}

export function createFactoryAdapter(): AgentAdapter {
  let capabilities = factoryDefaultCapabilities;

  return {
    kind: factoryDetectionSpec.kind,
    label: factoryDetectionSpec.label,
    binary: factoryDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "factory",
          label: factoryDetectionSpec.label,
          globalPath: ".factory/skills",
          projectPath: ".factory/skills",
        },
        {
          id: "agent",
          label: "Agent-compatible skills",
          projectPath: ".agent/skills",
        },
      ],
      projectionRoots: [
        {
          id: "factory",
          label: factoryDetectionSpec.label,
          globalPath: ".factory/skills",
          projectPath: ".factory/skills",
          linkProjectionFromVersion: "0.56.0",
        },
      ],
      invocation: "slash",
      precedence: {
        global: ["factory"],
        project: ["factory", "agent"],
      },
    },
    ...(factoryDetectionSpec.update ? { update: factoryDetectionSpec.update } : {}),
    ...inheritBaseSpawnEnv(factoryDetectionSpec),
    get capabilities() {
      return capabilities;
    },
    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, factoryDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },
    buildLaunchArgv() {
      return {
        binary: "droid",
        args: [...FACTORY_ACP_ARGS],
      };
    },
    buildResumeArgv() {
      return {
        binary: "droid",
        args: [...FACTORY_ACP_ARGS],
      };
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      const command = buildFactoryCommand(
        input.projectLocation,
        resolveAgentBinaryPath(input.projectLocation, "droid"),
      );
      // Droid answers `initialize` without an `mcpCapabilities` block even
      // though `session/new` connects HTTP MCP servers fine (verified against
      // droid 0.188.0, `exec --output-format acp`). Left to the advertised
      // capabilities alone it would receive none of Poracode's built-in MCP
      // servers, which are all HTTP.
      const session = createAcpStructuredSession(command, input, {
        assumedMcpCapabilities: { http: true },
      });
      if (session) attachFactorySubagentTranscripts(session, input.projectLocation);
      return session;
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildFactoryCommand(location, resolveAgentBinaryPath(location, "droid"));
    },
    defaultOneShotModel: "auto",
    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      const args = ["exec", "--output-format", "text"];
      if (model) args.push("--model", model);
      if (effort) args.push("--reasoning-effort", effort);
      return {
        command: "droid",
        args,
      };
    },
  };
}
