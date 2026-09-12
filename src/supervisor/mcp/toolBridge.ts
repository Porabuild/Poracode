import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/client";
import type { ResolvedMcpServer } from "@/shared/contracts";
import { createUpstreamTransport } from "./mcpToolFilterProxy";

export type BridgeToolResult = Awaited<ReturnType<Client["callTool"]>>;
export type BridgeTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
export type BridgeToolCall = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<BridgeToolResult>;

/** Model APIs require ASCII tool names of at most 64 characters. */
export function mcpBridgeToolName(server: string, tool: string): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([server, tool]))
    .digest("hex")
    .slice(0, 12);
  return `${`mcp__${server}__${tool}`.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 51)}_${hash}`;
}

/** Connections belong to the CLI process, surviving native session switches. */
export async function registerMcpBridgeTools(
  servers: readonly ResolvedMcpServer[],
  options: {
    clientName: string;
    register(
      server: ResolvedMcpServer,
      tool: BridgeTool,
      call: BridgeToolCall,
    ): (() => void) | void;
    onError(server: ResolvedMcpServer): void;
  },
): Promise<() => Promise<void>> {
  const clients: Client[] = [];
  const registrations: (() => void)[] = [];
  let closing: Promise<void> | undefined;
  const shutdown = () => {
    if (closing) return closing;
    process.removeListener("exit", onExit);
    for (const dispose of registrations.splice(0)) dispose();
    closing = Promise.allSettled(clients.splice(0).map((client) => client.close())).then(
      () => undefined,
    );
    return closing;
  };
  const onExit = () => {
    void shutdown();
  };
  process.once("exit", onExit);
  for (const server of servers) {
    const client = new Client({ name: options.clientName, version: "1.0.0" });
    clients.push(client);
    const requestOptions = {
      timeout: server.timeoutMs,
      signal: AbortSignal.timeout(server.timeoutMs),
    };
    try {
      await client.connect(createUpstreamTransport(server), requestOptions);
      const { tools } = await client.listTools(undefined, requestOptions);
      const disabled = new Set(server.disabledTools ?? []);
      for (const tool of tools) {
        if (disabled.has(tool.name)) continue;
        const dispose = options.register(server, tool, (input, signal) =>
          client.callTool(
            { name: tool.name, arguments: input },
            { timeout: server.timeoutMs, ...(signal ? { signal } : {}) },
          ),
        );
        if (dispose) registrations.push(dispose);
      }
    } catch {
      await client.close().catch(() => undefined);
      options.onError(server);
    }
  }
  return shutdown;
}
