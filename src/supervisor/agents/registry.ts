import type { AgentAdapter } from "./base";
import { createClaudeAdapter } from "./claude";
import { createCodexAdapter } from "./codex";
import { createGeminiAdapter } from "./gemini";

export function createAgentRegistry(): AgentAdapter[] {
  return [createCodexAdapter(), createClaudeAdapter(), createGeminiAdapter()];
}
