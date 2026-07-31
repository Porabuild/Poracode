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
import { createAcpGenericAdapter } from "./acp-generic";
import { createAntigravityAdapter } from "./antigravity";
import type { AgentAdapter } from "./base";
import { createClaudeAdapter, createClaudeProfileAdapter } from "./claude";
import { createCommandCodeAdapter } from "./commandcode";
import { createCopilotAdapter } from "./copilot";
import { createCodexAdapter } from "./codex";
import { createCursorAdapter } from "./cursor";
import { createFactoryAdapter } from "./factory";
import { createGeminiAdapter } from "./gemini";
import { createGrokAdapter } from "./grok";
import { createKimiAdapter } from "./kimi";
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
  const builtIns = [
    createClaudeAdapter(),
    createCopilotAdapter(),
    createCodexAdapter(),
    createGeminiAdapter(),
    createQwenAdapter(),
    createQoderAdapter(),
    createGrokAdapter(),
    createKimiAdapter(),
    createAntigravityAdapter(),
    createCommandCodeAdapter(),
    createCursorAdapter(),
    createOpenCodeAdapter(),
    createPiAdapter(),
    createFactoryAdapter(),
  ];
  const userAdapters = userInstances
    .filter((inst) => inst.enabled !== false && inst.driver === "acp-generic")
    .map((inst) => createAcpGenericAdapter(inst));
  const claudeProfileAdapters = userInstances
    .filter((inst) => inst.enabled !== false && inst.driver === "claude")
    .flatMap((inst) => {
      try {
        return [createClaudeProfileAdapter(inst)];
      } catch (error) {
        console.warn(
          `[agents] skipping Claude profile ${inst.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }
    });
  const adapters = [...builtIns, ...claudeProfileAdapters, ...userAdapters];
  const kinds = new Set(adapters.map((a) => a.kind));
  if (kinds.size !== adapters.length) {
    throw new Error("Duplicate agent kind in registry");
  }
  return adapters;
}
