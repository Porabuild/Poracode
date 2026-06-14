import { baseAgentKind, type ThreadPresentationMode } from "@/shared/contracts";

/**
 * How a given (agentKind, presentationMode) pair gates Browser MCP per-thread.
 * The mapping mirrors what the supervisor adapters actually do:
 *
 * - "always":  the MCP server set is rebuilt on every turn (Claude SDK GUI).
 *              Badge is toggleable mid-thread.
 * - "launch":  the MCP server set is baked in at thread/session start
 *              (Codex `-c` argv, ACP `newSession.mcpServers`). Badge controls
 *              launch; once running it is read-only.
 * - "none":    no per-thread gating point exists (Claude TUI: no MCP wired;
 *              Gemini TUI / OpenCode TUI: install-time global config).
 *
 * Source of truth: `src/supervisor/agents/*\/mcpBrowser.ts` and their callers.
 */
export type BrowserMcpScope = "none" | "launch" | "always";

export function getBrowserMcpScope(
  agentKind: string,
  presentationMode: ThreadPresentationMode,
): BrowserMcpScope {
  const baseKind = baseAgentKind(agentKind);
  if (presentationMode === "gui") {
    if (baseKind === "claude") return "always";
    if (baseKind === "opencode" || baseKind === "antigravity" || baseKind === "commandcode")
      return "none";
    return "launch";
  }
  if (baseKind === "codex") return "launch";
  return "none";
}
