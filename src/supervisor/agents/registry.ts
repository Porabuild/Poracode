/**
 * Provider manifest (supervisor).
 * To add a provider: import its factory, add to the array.
 * To remove: delete its import + array entry, then delete its folder.
 */
import type { AgentAdapter } from "./base";
import { createClaudeAdapter } from "./claude";
import { createCodexAdapter } from "./codex";
import { createGeminiAdapter } from "./gemini";

export function createAgentRegistry(): AgentAdapter[] {
  const adapters = [createCodexAdapter(), createClaudeAdapter(), createGeminiAdapter()];
  const kinds = new Set(adapters.map((a) => a.kind));
  if (kinds.size !== adapters.length) {
    throw new Error("Duplicate agent kind in registry");
  }
  return adapters;
}
