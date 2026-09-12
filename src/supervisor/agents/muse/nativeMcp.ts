import { DEFAULT_MCP_SERVER_TIMEOUT_MS } from "@/shared/contracts";
import { homedir } from "node:os";
import { join } from "node:path";
import { nativeJsonMcpConfig } from "../../mcp/nativeSetup/jsonConfig";
import type { NativeMcpConfigFile } from "../../mcp/nativeSetup/configFile";

export function museNativeMcpConfig(
  path = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "muse", "settings.json"),
): NativeMcpConfigFile {
  return nativeJsonMcpConfig(
    path,
    (server) => {
      if (server.timeoutMs !== DEFAULT_MCP_SERVER_TIMEOUT_MS)
        throw new Error("Custom timeouts are not supported by native setup");
      if (server.disabledTools?.length)
        throw new Error("Tool restrictions are not supported by native setup");
      const transport = server.transport;
      if (transport.type === "stdio") {
        if (transport.cwd) throw new Error("Working directory is not supported by native setup");
        return {
          enabled: true,
          transport: "stdio",
          command: transport.command,
          args: transport.args,
          env: transport.env,
          framing: "line_delimited_json",
        };
      }
      if (transport.type === "sse") throw new Error("SSE is not supported by native setup");
      return {
        enabled: true,
        transport: "streamable_http",
        url: transport.url,
        headers: transport.headers,
      };
    },
    { defaults: { schema_version: 1 } },
  );
}
