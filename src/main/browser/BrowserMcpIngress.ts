import type { BrowserPanelManager } from "./BrowserPanelManager";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../mcp/StreamableHttpMcpIngress";
import {
  BROWSER_MCP_INSTRUCTIONS,
  TOOLS,
  dispatchTool,
  formatToolResult,
  isKnownToolName,
  normalizeToolName,
  type ToolContext,
} from "./mcp/toolRegistry";

export type BrowserMcpIngressInfo = StreamableHttpMcpIngressInfo;

const PASSIVE_TOOLS = new Set(["api", "list_tabs", "get_url", "get_title"]);

/**
 * Single in-process MCP server. Speaks Streamable-HTTP MCP at `POST /mcp`
 * (JSON-RPC body, single JSON response). All five agent providers connect
 * here by URL — no per-thread Node child process.
 */
export class BrowserMcpIngress {
  private allowEval = false;
  private allowDataAccess = false;
  private getManager: (() => BrowserPanelManager | null) | null = null;
  private readonly ingress = new StreamableHttpMcpIngress<ToolContext>({
    serverInfo: { name: "browser", version: "2.0.0" },
    instructions: BROWSER_MCP_INSTRUCTIONS,
    tools: TOOLS,
    isKnownToolName,
    buildContext: () => this.buildContext(),
    contextUnavailableMessage: "browser panel not ready",
    onBeforeToolCall: (name, ctx) => {
      if (shouldRevealPanelForTool(name)) {
        ctx.manager.revealPanel();
      }
    },
    dispatchTool,
    formatToolResult,
  });

  setManagerAccessor(getter: () => BrowserPanelManager | null): void {
    this.getManager = getter;
  }

  setAllowEval(allow: boolean): void {
    this.allowEval = allow;
  }

  setAllowDataAccess(allow: boolean): void {
    this.allowDataAccess = allow;
  }

  start(): Promise<BrowserMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): BrowserMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  dispose(): void {
    this.ingress.dispose();
  }

  private buildContext(): ToolContext | null {
    const manager = this.getManager?.();
    if (!manager) return null;
    return {
      manager,
      allowEval: this.allowEval,
      allowDataAccess: this.allowDataAccess,
    };
  }
}

function shouldRevealPanelForTool(name: string): boolean {
  return !PASSIVE_TOOLS.has(normalizeToolName(name));
}
