/**
 * Provider manifest (supervisor).
 * To add a provider: import its factory, add to the array.
 * To remove: delete its import + array entry, then delete its folder.
 */
import type { AgentAdapter } from "./base";
import { createClaudeAdapter } from "./claude";
import { createCopilotAdapter } from "./copilot";
import { createCodexAdapter } from "./codex";
import { createCursorAdapter } from "./cursor";
import { createGeminiAdapter } from "./gemini";

export function createAgentRegistry(): AgentAdapter[] {
  const adapters = [
    createClaudeAdapter(),
    createCopilotAdapter(),
    createCodexAdapter(),
    createGeminiAdapter(),
    createCursorAdapter(),
  ];
  const kinds = new Set(adapters.map((a) => a.kind));
  if (kinds.size !== adapters.length) {
    throw new Error("Duplicate agent kind in registry");
  }
  return adapters;
}
