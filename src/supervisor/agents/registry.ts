import type { AgentAdapter } from "./base";
import { createClaudeAdapter } from "./claude";
import { createCodexAdapter } from "./codex";

export function createAgentRegistry(): AgentAdapter[] {
  return [createCodexAdapter(), createClaudeAdapter()];
}
