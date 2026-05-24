/**
 * Provider manifest (supervisor).
 * To add a built-in provider: import its factory, add to the array.
 * To remove: delete its import + array entry, then delete its folder.
 *
 * For runtime-extensible ACP-speaking agents, pass `userInstances` to
 * `buildAgentRegistry` — each `acp-generic` instance becomes a discrete
 * adapter via `createAcpGenericAdapter`.
 */
import type { AgentInstanceConfig } from "@/shared/contracts";
import { createAcpGenericAdapter } from "./acp-generic";
import { createAntigravityAdapter } from "./antigravity";
import type { AgentAdapter } from "./base";
import { createClaudeAdapter } from "./claude";
import { createCopilotAdapter } from "./copilot";
import { createCodexAdapter } from "./codex";
import { createCursorAdapter } from "./cursor";
import { createGeminiAdapter } from "./gemini";
import { createGrokAdapter } from "./grok";
import { createOpenCodeAdapter } from "./opencode";

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
    createCursorAdapter(),
    createOpenCodeAdapter(),
  ];
  const userAdapters = userInstances
    .filter((inst) => inst.enabled !== false && inst.driver === "acp-generic")
    .map((inst) => createAcpGenericAdapter(inst));
  const adapters = [...builtIns, ...userAdapters];
  const kinds = new Set(adapters.map((a) => a.kind));
  if (kinds.size !== adapters.length) {
    throw new Error("Duplicate agent kind in registry");
  }
  return adapters;
}
