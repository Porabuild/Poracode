import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { McpManager } from "@/renderer/components/mcp/McpManager";
import { SettingsPage } from "./SettingsForm";

export function McpServersSettings() {
  const mcpServers = useSharedSettings((s) => s.mcpServers);
  const setMcpServers = useSharedSettings((s) => s.setMcpServers);

  return (
    <SettingsPage
      title="MCP Servers"
      description="Model Context Protocol servers managed by Lightcode and injected into every agent at launch (Claude, Codex, Cursor, Gemini, OpenCode, and more). Scope a server to specific agents, or add per-project servers in Project Settings."
    >
      <McpManager servers={mcpServers} onChange={setMcpServers} />
    </SettingsPage>
  );
}
