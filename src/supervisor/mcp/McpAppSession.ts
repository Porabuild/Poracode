import type { Client } from "@modelcontextprotocol/client";
import { isMcpToolVisibleTo, type McpAppResource } from "@/shared/mcpAppResources";
import type { BridgeTool, BridgeToolResult } from "./toolBridge";
import { readMcpToolResource } from "./mcpAppResult";

/** One live upstream connection; callers never supply a server URL or credentials. */
export class McpAppSession {
  private readonly controller = new AbortController();
  private readonly disabled: Set<string>;

  constructor(
    private readonly client: Pick<
      Client,
      "listTools" | "callTool" | "readResource" | "listResources"
    >,
    private readonly options: { disabledTools: readonly string[]; timeoutMs: number },
  ) {
    this.disabled = new Set(options.disabledTools);
  }

  private requestOptions(signal?: AbortSignal) {
    return {
      timeout: this.options.timeoutMs,
      maxTotalTimeout: this.options.timeoutMs,
      signal: signal ? AbortSignal.any([this.controller.signal, signal]) : this.controller.signal,
    };
  }

  async listTools(signal?: AbortSignal): Promise<BridgeTool[]> {
    const options = this.requestOptions(signal);
    options.signal.throwIfAborted();
    const { tools } = await this.client.listTools(undefined, options);
    options.signal.throwIfAborted();
    return tools.filter((tool) => !this.disabled.has(tool.name) && isMcpToolVisibleTo(tool, "app"));
  }

  async callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<BridgeToolResult> {
    // Refresh discovery before every call: a removed or newly model-only tool
    // must not remain callable through a stale iframe's tool list.
    const tools = await this.listTools(signal);
    if (!tools.some((tool) => tool.name === params.name)) {
      throw new Error("MCP App tool is unavailable.");
    }
    const options = this.requestOptions(signal);
    options.signal.throwIfAborted();
    const result = await this.client.callTool(params, options);
    options.signal.throwIfAborted();
    return result;
  }

  async readToolResource(toolName: string, signal?: AbortSignal): Promise<McpAppResource> {
    const options = this.requestOptions(signal);
    options.signal.throwIfAborted();
    const { tools } = await this.client.listTools(undefined, options);
    options.signal.throwIfAborted();
    const tool = tools.find(
      (entry) =>
        entry.name === toolName &&
        !this.disabled.has(entry.name) &&
        (isMcpToolVisibleTo(entry, "model") || isMcpToolVisibleTo(entry, "app")),
    );
    if (!tool) throw new Error("MCP App resource is unavailable.");
    const resource = await readMcpToolResource(this.client, tool, options);
    options.signal.throwIfAborted();
    if (!resource) throw new Error("MCP App resource is unavailable.");
    return resource;
  }

  /** The connection owner closes the client; retiring this session cancels app work. */
  close(): void {
    this.controller.abort();
  }
}
