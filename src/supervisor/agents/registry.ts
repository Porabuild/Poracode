/**
 * Provider manifest (supervisor).
 * To add a built-in provider: import its factory, add to the array.
 * To remove: delete its import + array entry, then delete its folder.
 *
 * `registry.test.ts` discovers adjacent detection specs and fails if this list
 * omits one. Renderer metadata and native install wiring remain separate; see
 * .agents/docs/agent-adapters.md → "Adding a New Provider — Full Checklist".
 *
 * For runtime-extensible ACP-speaking agents, pass `userInstances` to
 * `buildAgentRegistry` — each `acp-generic` instance becomes a discrete
 * adapter via `createAcpGenericAdapter`.
 */
import type { AgentInstanceConfig } from "@/shared/contracts";
import { ANTIGRAVITY_ACP_REGISTRY_ID } from "@/shared/agents/antigravity";
import { createAcpGenericAdapter } from "./acp-generic";
import { createAntigravityAdapter } from "./antigravity";
import type { AgentAdapter } from "./base";
import { createClaudeAdapter, createClaudeProfileAdapter } from "./claude";
import { createCommandCodeAdapter } from "./commandcode";
import { createCopilotAdapter } from "./copilot";
import { createCodexAdapter } from "./codex";
import { createCursorAdapter, createCursorProfileAdapter } from "./cursor";
import { createFactoryAdapter } from "./factory";
import { createGeminiAdapter } from "./gemini";
import { createGrokAdapter } from "./grok";
import { createKimiAdapter } from "./kimi";
import { createMuseAdapter } from "./muse";
import { createOpenCodeAdapter } from "./opencode";
import { createPiAdapter } from "./pi";
import { createQoderAdapter } from "./qoder";
import { createQwenAdapter } from "./qwen";

export function createAgentRegistry(): AgentAdapter[] {
  return buildAgentRegistry([]);
}

/**
 * Build the supervisor's agent registry from built-in adapters plus any
 * user-registered `acp-generic` instances. Threads referencing a registered
 * instance's id resolve to its adapter via `kind === "acp-generic:<id>"`.
 */
export function buildAgentRegistry(userInstances: AgentInstanceConfig[]): AgentAdapter[] {
  const antigravityAcpInstance = userInstances.find(
    (instance) =>
      instance.id === ANTIGRAVITY_ACP_REGISTRY_ID &&
      instance.driver === "acp-generic" &&
      instance.enabled !== false,
  );
  const builtIns = [
    createClaudeAdapter(),
    createCopilotAdapter(),
    createCodexAdapter(),
    createGeminiAdapter(),
    createQwenAdapter(),
    createQoderAdapter(),
    createGrokAdapter(),
    createKimiAdapter(),
    createMuseAdapter(),
    createAntigravityAdapter(antigravityAcpInstance),
    createCommandCodeAdapter(),
    createCursorAdapter(),
    createOpenCodeAdapter(),
    createPiAdapter(),
    createFactoryAdapter(),
  ];
  const firstClassRegistryIds = new Set(
    builtIns.flatMap((adapter) =>
      adapter.firstClassAcpRegistryId ? [adapter.firstClassAcpRegistryId] : [],
    ),
  );
  const userAdapters = userInstances
    .filter(
      (inst) =>
        inst.enabled !== false &&
        inst.driver === "acp-generic" &&
        !firstClassRegistryIds.has(inst.id),
    )
    .map((inst) => createAcpGenericAdapter(inst));
  // One entry per multi-profile provider. Everything else here is generic, so
  // giving a new provider profiles means adding its factory below (and its
  // `driver` to `AGENT_PROFILE_DRIVERS`) — not another filter/flatMap block.
  const profileAdapterFactories: Record<string, (instance: AgentInstanceConfig) => AgentAdapter> = {
    claude: createClaudeProfileAdapter,
    cursor: createCursorProfileAdapter,
  };
  const profileAdapters = userInstances
    .filter((inst) => inst.enabled !== false && profileAdapterFactories[inst.driver] !== undefined)
    .flatMap((inst) => {
      try {
        return [profileAdapterFactories[inst.driver]!(inst)];
      } catch (error) {
        // A profile missing its credential or config is skipped, not fatal:
        // one broken profile must not take the whole registry down.
        console.warn(
          `[agents] skipping ${inst.driver} profile ${inst.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }
    });
  const adapters = [...builtIns, ...profileAdapters, ...userAdapters];
  const kinds = new Set(adapters.map((a) => a.kind));
  if (kinds.size !== adapters.length) {
    throw new Error("Duplicate agent kind in registry");
  }
  return adapters;
}
