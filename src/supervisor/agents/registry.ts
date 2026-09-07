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
import { createFactoryAdapter, createFactoryAcpRegistryAdapter } from "./factory";
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
  return buildAgentRegistryEntries(userInstances).map((entry) => entry.adapter);
}

/**
 * One registry adapter plus the persisted config that produced it. `inputKey`
 * is a stable serialization of that config (empty for built-ins that take no
 * instance), so a caller holding a live adapter map can keep the existing
 * instance — and the install/auth state its `detectInstall` already learned —
 * whenever the key is unchanged, instead of replacing it with a fresh adapter
 * that has not probed anything yet.
 */
export interface AgentRegistryEntry {
  adapter: AgentAdapter;
  inputKey: string;
}

function instanceInputKey(instance: AgentInstanceConfig | undefined): string {
  return instance ? JSON.stringify(instance) : "";
}

export function buildAgentRegistryEntries(
  userInstances: AgentInstanceConfig[],
): AgentRegistryEntry[] {
  const antigravityAcpInstance = userInstances.find(
    (instance) =>
      instance.id === ANTIGRAVITY_ACP_REGISTRY_ID &&
      instance.driver === "acp-generic" &&
      instance.enabled !== false,
  );
  const builtIn = (adapter: AgentAdapter): AgentRegistryEntry => ({ adapter, inputKey: "" });
  const builtIns: AgentRegistryEntry[] = [
    builtIn(createClaudeAdapter()),
    builtIn(createCopilotAdapter()),
    builtIn(createCodexAdapter()),
    builtIn(createGeminiAdapter()),
    builtIn(createQwenAdapter()),
    builtIn(createQoderAdapter()),
    builtIn(createGrokAdapter()),
    builtIn(createKimiAdapter()),
    builtIn(createMuseAdapter()),
    {
      adapter: createAntigravityAdapter(antigravityAcpInstance),
      inputKey: instanceInputKey(antigravityAcpInstance),
    },
    builtIn(createCommandCodeAdapter()),
    builtIn(createCursorAdapter()),
    builtIn(createOpenCodeAdapter()),
    builtIn(createPiAdapter()),
    builtIn(createFactoryAdapter()),
  ];
  const firstClassRegistryIds = new Set(
    builtIns.flatMap(({ adapter }) =>
      adapter.firstClassAcpRegistryId ? [adapter.firstClassAcpRegistryId] : [],
    ),
  );
  const acpRegistryAdapterFactories = new Map<
    string,
    (instance: AgentInstanceConfig) => AgentAdapter
  >([["factory-droid", createFactoryAcpRegistryAdapter]]);
  const userAdapters = userInstances
    .filter(
      (inst) =>
        inst.enabled !== false &&
        inst.driver === "acp-generic" &&
        !firstClassRegistryIds.has(inst.id),
    )
    .map((inst): AgentRegistryEntry => ({
      adapter: (acpRegistryAdapterFactories.get(inst.id) ?? createAcpGenericAdapter)(inst),
      inputKey: instanceInputKey(inst),
    }));
  // One entry per multi-profile provider. Everything else here is generic, so
  // giving a new provider profiles means adding its factory below (and its
  // `driver` to `AGENT_PROFILE_DRIVERS`) — not another filter/flatMap block.
  const profileAdapterFactories: Record<string, (instance: AgentInstanceConfig) => AgentAdapter> = {
    claude: createClaudeProfileAdapter,
    cursor: createCursorProfileAdapter,
  };
  const profileAdapters = userInstances
    .filter((inst) => inst.enabled !== false && profileAdapterFactories[inst.driver] !== undefined)
    .flatMap((inst): AgentRegistryEntry[] => {
      try {
        return [
          {
            adapter: profileAdapterFactories[inst.driver]!(inst),
            inputKey: instanceInputKey(inst),
          },
        ];
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
  const entries = [...builtIns, ...profileAdapters, ...userAdapters];
  const kinds = new Set(entries.map((entry) => entry.adapter.kind));
  if (kinds.size !== entries.length) {
    throw new Error("Duplicate agent kind in registry");
  }
  return entries;
}
