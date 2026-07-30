/**
 * Provider manifest (supervisor).
 * To add a built-in provider: import its factory, add to the array.
 * To remove: delete its import + array entry, then delete its folder.
 *
 * `registry.test.ts` discovers adjacent detection specs and fails if this list
 * omits one. Renderer metadata and native install wiring remain separate; see
 * .agents/docs/agent-adapters.md → "Adding a New Provider — Full Checklist".
 *
 * Pass `userInstances` to `buildAgentRegistry` for provider profiles and
 * runtime-extensible ACP agents; each enabled instance becomes a discrete
 * adapter.
 */
import type { AgentInstanceConfig } from "@/shared/contracts";
import { createAcpGenericAdapter } from "./acp-generic";
import { createAntigravityAdapter } from "./antigravity";
import type { AgentAdapter } from "./base";
import { createClaudeAdapter, createClaudeProfileAdapter } from "./claude";
import { createCommandCodeAdapter } from "./commandcode";
import { createCopilotAdapter, createCopilotProfileAdapter } from "./copilot";
import { createCodexAdapter, createCodexProfileAdapter } from "./codex";
import { createCursorAdapter } from "./cursor";
import { createFactoryAdapter } from "./factory";
import { createGeminiAdapter, createGeminiProfileAdapter } from "./gemini";
import { createGrokAdapter, createGrokProfileAdapter } from "./grok";
import { createOpenCodeAdapter } from "./opencode";

type ProfileAdapterFactory = {
  label: string;
  create(instance: AgentInstanceConfig): AgentAdapter;
};

const PROFILE_ADAPTER_FACTORIES: Readonly<Record<string, ProfileAdapterFactory>> = {
  claude: { label: "Claude", create: createClaudeProfileAdapter },
  codex: { label: "Codex", create: createCodexProfileAdapter },
  copilot: { label: "Copilot", create: createCopilotProfileAdapter },
  gemini: { label: "Gemini", create: createGeminiProfileAdapter },
  grok: { label: "Grok", create: createGrokProfileAdapter },
};

export function createAgentRegistry(): AgentAdapter[] {
  return buildAgentRegistry([]);
}

/**
 * Build the supervisor's agent registry from built-in adapters plus any
 * user-registered `acp-generic` instances. Threads referencing a registered
 * instance's id resolve to its adapter via `kind === "acp-generic:<id>"`.
 */
export function buildAgentRegistry(userInstances: AgentInstanceConfig[]): AgentAdapter[] {
  const builtIns = [
    createClaudeAdapter(),
    createCopilotAdapter(),
    createCodexAdapter(),
    createGeminiAdapter(),
    createGrokAdapter(),
    createAntigravityAdapter(),
    createCommandCodeAdapter(),
    createCursorAdapter(),
    createOpenCodeAdapter(),
    createFactoryAdapter(),
  ];
  const userAdapters = userInstances
    .filter((inst) => inst.enabled !== false && inst.driver === "acp-generic")
    .map((inst) => createAcpGenericAdapter(inst));
  const profileAdapters = userInstances.flatMap((inst) => {
    if (inst.enabled === false) return [];
    const factory = PROFILE_ADAPTER_FACTORIES[inst.driver];
    if (!factory) return [];
    try {
      return [factory.create(inst)];
    } catch (error) {
      console.warn(
        `[agents] skipping ${factory.label} profile ${inst.id}: ${
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
