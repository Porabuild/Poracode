import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import type { AgentVisionService } from "@/host/AgentVisionService";
import { captureScreenshotPng } from "../cdp/tools";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../../mcp/StreamableHttpMcpIngress";
import {
  CHROME_MCP_INSTRUCTIONS,
  CHROME_TOOLS,
  dispatchChromeTool,
  normalizeChromeToolName,
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
  private vision: AgentVisionService | undefined;
  private allowEval = false;
  private allowDataAccess = false;
  private readonly activeSessions = new Set<string>();
  private getConnection: (() => ExternalChromeConnection | null) | null = null;
  private closing: Promise<void> | undefined;
  private readonly ingress = new StreamableHttpMcpIngress<ChromeToolContext>({
    // Chrome MCP is intentionally unavailable to WSL agents, so exposing this
    // control surface beyond loopback is unnecessary.
    bindHost: "127.0.0.1",
    serverInfo: { name: "chrome", version: "1.0.0" },
    instructions: CHROME_MCP_INSTRUCTIONS,
    tools: CHROME_TOOLS,
    normalizeToolName: normalizeChromeToolName,
    isKnownToolName: (name) => CHROME_TOOLS.some((tool) => tool.name === name),
    buildContext: (identity) => this.buildContext(identity),
    dispatchTool: (name, args, ctx) => this.dispatchWithVision(name, args, ctx),
    formatToolResult: (_name, result) => formatChromeToolResult(result),
  });

  setConnectionAccessor(getter: () => ExternalChromeConnection | null): void {
    this.getConnection = getter;
  }

  setAgentVision(vision: AgentVisionService): void {
    this.vision = vision;
  }

  private async dispatchWithVision(
    name: string,
    args: Record<string, unknown>,
    ctx: ChromeToolContext,
  ): Promise<unknown> {
    if (!this.vision || !ctx.threadId || ["api", "status", "list_tabs"].includes(name))
      return dispatchChromeTool(name, args, ctx);
    if (name === "disable") {
      this.vision?.stop(ctx.threadId);
      return dispatchChromeTool(name, args, ctx);
    }
    const originalTarget = ctx.connection?.status();
    const connection = ctx.connection;
    let tabId = originalTarget?.attachedTabId;
    const capture = async () => {
      if (!connection || tabId == null || connection.status().attachedTabId !== tabId) return null;
      const bytes = await captureScreenshotPng(connection.cdpSession(tabId), {
        format: "jpeg",
        quality: 60,
      });
      return { image: `data:image/jpeg;base64,${bytes.toString("base64")}` };
    };
    const activity = this.vision.begin(ctx.threadId, "chrome", name, {
      ...(!["open", "attach"].includes(name)
        ? {
            capture,
            ...(originalTarget?.attachedUrl ? { target: originalTarget.attachedUrl } : {}),
          }
        : {}),
    });
    try {
      const result = await dispatchChromeTool(name, args, ctx);
      const returned =
        result && typeof result === "object"
          ? (result as {
              opened?: { tabId: number; url: string };
              attached?: { tabId: number; url: string };
              url?: string;
            })
          : undefined;
      const returnedTab = returned?.opened ?? returned?.attached;
      tabId = returnedTab?.tabId ?? tabId;
      const target = returnedTab?.url ?? returned?.url ?? originalTarget?.attachedUrl;
      activity?.finish({
        failed: Boolean(result && typeof result === "object" && "error" in result),
        ...(target ? { target } : {}),
        capture,
      });
      return result;
    } catch (error) {
      activity?.finish({ failed: true });
      throw error;
    }
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

  dispose(): Promise<void> {
    this.closing ??= this.ingress.dispose().then(() => {
      // An admitted enable/disable may update presence after awaiting Chrome.
      // Clear only after every such continuation has finished.
      this.activeSessions.clear();
    });
    return this.closing;
  }

  private buildContext(identity: McpThreadIdentity): ChromeToolContext {
    const sessionId = identity.threadId ?? "unscoped";
    return {
      connection: this.getConnection?.() ?? null,
      disabledTools: (identity.disabledTools ?? []).map(normalizeChromeToolName),
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
