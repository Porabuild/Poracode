import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../../mcp/StreamableHttpMcpIngress";
import {
  CHROME_MCP_INSTRUCTIONS,
  CHROME_TOOL_NAMES,
  CHROME_TOOLS,
  dispatchChromeTool,
  formatChromeToolResult,
  type ChromeToolContext,
} from "./chromeTools";
import type { ExternalChromeConnection } from "./ExternalChromeConnection";

export type ChromeMcpIngressInfo = StreamableHttpMcpIngressInfo;

/**
 * Streamable-HTTP MCP endpoint for controlling the user's external Chrome.
 * The protocol, authentication, request bounds, and Host validation live in
 * the shared ingress; this wrapper owns only Chrome-specific context and tools.
 */
export class ChromeMcpIngress {
  private allowEval = false;
  private allowDataAccess = false;
  private readonly activeSessions = new Set<string>();
  private getConnection: (() => ExternalChromeConnection | null) | null = null;
  private readonly ingress = new StreamableHttpMcpIngress<ChromeToolContext>({
    // Chrome MCP is intentionally unavailable to WSL agents, so exposing this
    // control surface beyond loopback is unnecessary.
    bindHost: "127.0.0.1",
    serverInfo: { name: "chrome", version: "1.0.0" },
    instructions: CHROME_MCP_INSTRUCTIONS,
    tools: CHROME_TOOLS,
    isKnownToolName: (name) => CHROME_TOOL_NAMES.has(name),
    buildContext: (identity) => this.buildContext(identity),
    dispatchTool: dispatchChromeTool,
    formatToolResult: (_name, result) => formatChromeToolResult(result),
  });

  setConnectionAccessor(getter: () => ExternalChromeConnection | null): void {
    this.getConnection = getter;
  }

  setAllowEval(allow: boolean): void {
    this.allowEval = allow;
  }

  setAllowDataAccess(allow: boolean): void {
    this.allowDataAccess = allow;
  }

  start(): Promise<ChromeMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): ChromeMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  dispose(): void {
    this.activeSessions.clear();
    this.ingress.dispose();
  }

  private buildContext(identity: McpThreadIdentity): ChromeToolContext {
    const sessionId = identity.threadId ?? "unscoped";
    return {
      connection: this.getConnection?.() ?? null,
      allowEval: this.allowEval,
      allowDataAccess: this.allowDataAccess,
      setSessionActive: (active) => {
        if (active) this.activeSessions.add(sessionId);
        else this.activeSessions.delete(sessionId);
        return this.activeSessions.size === 0;
      },
      ...(identity.threadId ? { threadId: identity.threadId } : {}),
      ...(identity.title ? { threadTitle: identity.title } : {}),
    };
  }
}
