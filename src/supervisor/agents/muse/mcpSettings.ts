import type { ResolvedMcpServer } from "@/shared/contracts";

/** Native and per-run settings share this shape; MSP has a separate wire format. */
export function buildMuseSettingsMcpServer(
  transport: Exclude<ResolvedMcpServer["transport"], { type: "sse" }>,
) {
  return transport.type === "stdio"
    ? {
        enabled: true,
        transport: "stdio" as const,
        command: transport.command,
        args: transport.args,
        env: transport.env,
      }
    : {
        enabled: true,
        transport: "streamable_http" as const,
        url: transport.url,
        headers: transport.headers,
      };
}
