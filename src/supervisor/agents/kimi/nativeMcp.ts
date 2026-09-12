import { join } from "node:path";
import { nativeJsonMcpConfig } from "../../mcp/nativeSetup/jsonConfig";
import { nativeKimiHomePath } from "./paths";
import type { NativeMcpConfigFile } from "../../mcp/nativeSetup/configFile";

export function kimiNativeMcpConfig(
  path = join(nativeKimiHomePath(), "mcp.json"),
): NativeMcpConfigFile {
  return nativeJsonMcpConfig(path, (server) => {
    const { type, ...transport } = server.transport;
    return {
      ...transport,
      ...(type === "sse" ? { transport: "sse" } : {}),
      startupTimeoutMs: server.timeoutMs,
      toolTimeoutMs: server.timeoutMs,
      ...(server.disabledTools?.length ? { disabledTools: server.disabledTools } : {}),
    };
  });
}
