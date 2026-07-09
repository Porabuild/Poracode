import type { McpThreadIdentity } from "@/shared/browserMcpThread";
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
  type ToolContext,
} from "./mcp/toolRegistry";

export type BrowserMcpIngressInfo = StreamableHttpMcpIngressInfo;

/**
 * Single in-process MCP server. Speaks Streamable-HTTP MCP at `POST /mcp`
 * (JSON-RPC body, single JSON response). All five agent providers connect
 * here by URL — no per-thread Node child process. The transport is shared
 * with the computer-use ingress via {@link StreamableHttpMcpIngress}.
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
    // Agent tool calls no longer force the browser panel open — the tab's
    // <webview> stays alive off-screen (see BrowserHost "background" mode),
    // so the agent works headless without stealing the user's UI. Hence no
    // onBeforeToolCall reveal hook.
    buildContext: (identity) => this.buildContext(identity),
    contextUnavailableMessage: "browser panel not ready",
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

  private buildContext(identity: McpThreadIdentity): ToolContext | null {
    const manager = this.getManager?.();
    if (!manager) return null;
    return {
      manager,
      allowEval: this.allowEval,
      allowDataAccess: this.allowDataAccess,
      ...(identity.threadId ? { threadId: identity.threadId } : {}),
      ...(identity.title ? { threadTitle: identity.title } : {}),
    };
  }
}
