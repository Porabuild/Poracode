import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import type { AgentVisionService } from "@/host/AgentVisionService";
import { runScreenshotTool } from "./mcp/tools/screenshot";
import type { BrowserPanelManager } from "./BrowserPanelManager";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "@/host/mcp/StreamableHttpMcpIngress";
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

/**
 * Single in-process MCP server. Speaks Streamable-HTTP MCP at `POST /mcp`
 * (JSON-RPC body, single JSON response). All five agent providers connect
 * here by URL — no per-thread Node child process. The transport is shared
 * with the computer-use ingress via {@link StreamableHttpMcpIngress}.
 */
export class BrowserMcpIngress {
  private vision: AgentVisionService | undefined;
  private allowEval = false;
  private allowDataAccess = false;
  private getManager: (() => BrowserPanelManager | null) | null = null;
  private readonly ingress = new StreamableHttpMcpIngress<ToolContext>({
    serverInfo: { name: "browser", version: "2.0.0" },
    instructions: BROWSER_MCP_INSTRUCTIONS,
    tools: TOOLS,
    isKnownToolName,
    normalizeToolName,
    // Agent tool calls no longer force the browser panel open — the tab's
    // <webview> stays alive off-screen (see BrowserHost "background" mode),
    // so the agent works headless without stealing the user's UI. Hence no
    // onBeforeToolCall reveal hook.
    buildContext: (identity) => this.buildContext(identity),
    contextUnavailableMessage: "browser panel not ready",
    dispatchTool: (name, args, ctx) => this.dispatchWithVision(name, args, ctx),
    formatToolResult,
  });

  setManagerAccessor(getter: () => BrowserPanelManager | null): void {
    this.getManager = getter;
  }

  setAgentVision(vision: AgentVisionService): void {
    this.vision = vision;
  }

  private async dispatchWithVision(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<unknown> {
    if (!this.vision || !ctx.threadId || ["api", "status", "list_tabs"].includes(name))
      return dispatchTool(name, args, ctx);
    if (name === "disable") {
      this.vision?.stop(ctx.threadId);
      return dispatchTool(name, args, ctx);
    }
    let tabId = typeof args.tabId === "string" ? args.tabId : ctx.manager.getActiveTab()?.tabId;
    const capture = async () => {
      const tab = tabId ? ctx.manager.getTab(tabId) : null;
      if (!tab || tab.isDestroyed() || !tab.isAttached()) return null;
      const shot = (await runScreenshotTool(ctx, {
        tabId,
        format: "jpeg",
        quality: 60,
        maxDimension: 960,
        maxBytes: 2 * 1024 * 1024,
      })) as { mimeType?: string; base64?: string };
      return shot.base64 && shot.mimeType
        ? { image: `data:${shot.mimeType};base64,${shot.base64}` }
        : null;
    };
    const initialTarget = ctx.manager.snapshot().tabs.find((tab) => tab.tabId === tabId)?.url;
    const activity = this.vision.begin(ctx.threadId, "browser", name, {
      ...(name !== "new_tab"
        ? { capture, ...(initialTarget ? { target: initialTarget } : {}) }
        : {}),
    });
    try {
      const result = await dispatchTool(name, args, ctx);
      const returnedTab =
        result && typeof result === "object" ? (result as { tabId?: string }).tabId : undefined;
      tabId = returnedTab ?? tabId;
      const target = ctx.manager.snapshot().tabs.find((tab) => tab.tabId === tabId)?.url;
      activity?.finish({
        failed: Boolean(
          result &&
          typeof result === "object" &&
          ("error" in result || ("timedOut" in result && result.timedOut === true)),
        ),
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

  start(): Promise<BrowserMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): BrowserMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  dispose(): Promise<void> {
    return this.ingress.dispose();
  }

  private buildContext(identity: McpThreadIdentity): ToolContext | null {
    const manager = this.getManager?.();
    if (!manager) return null;
    return {
      manager,
      disabledTools: (identity.disabledTools ?? []).map(normalizeToolName),
      allowEval: this.allowEval,
      allowDataAccess: this.allowDataAccess,
      ...(identity.threadId ? { threadId: identity.threadId } : {}),
      ...(identity.title ? { threadTitle: identity.title } : {}),
    };
  }
}
