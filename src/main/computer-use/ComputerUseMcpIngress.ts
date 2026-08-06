import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import { createComputerUseDriver } from "./drivers";
import type { ComputerUseDriver } from "./mcp/types";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../mcp/StreamableHttpMcpIngress";
import {
  COMPUTER_USE_MCP_INSTRUCTIONS,
  TOOLS,
  dispatchTool,
  formatToolResult,
  isInteractiveToolName,
  isKnownToolName,
  normalizeToolName,
  type ToolContext,
} from "./mcp/toolRegistry";

export type ComputerUseMcpIngressInfo = StreamableHttpMcpIngressInfo;

export type ComputerUseActivityEvent =
  | { kind: "session"; threadId: string; active: boolean }
  | { kind: "action"; threadId: string; active: boolean; toolName: string };

export interface ComputerUseMcpIngressOptions {
  driver?: ComputerUseDriver;
  onActivity?: (event: ComputerUseActivityEvent) => void;
}

export class ComputerUseMcpIngress {
  private readonly driver: ComputerUseDriver;
  private readonly ingress: StreamableHttpMcpIngress<ToolContext>;

  constructor(private readonly options: ComputerUseMcpIngressOptions = {}) {
    this.driver = options.driver ?? createComputerUseDriver();
    this.ingress = new StreamableHttpMcpIngress<ToolContext>({
      // Computer-use drives the host's real mouse/keyboard/windows, so the ingress
      // must never be reachable off the machine — bind loopback only (unlike the
      // browser ingress, which binds 0.0.0.0 for WSL reachability).
      bindHost: "127.0.0.1",
      serverInfo: { name: "computer_use", version: "0.1.0" },
      instructions: COMPUTER_USE_MCP_INSTRUCTIONS,
      tools: TOOLS,
      isKnownToolName,
      buildContext: (identity) => this.buildContext(identity),
      dispatchTool: (name, args, ctx) => this.dispatch(name, args, ctx),
      formatToolResult,
    });
  }

  start(): Promise<ComputerUseMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): ComputerUseMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  interruptActiveActions(): void {
    this.driver.dispose();
  }

  dispose(): void {
    this.ingress.dispose();
    // Release the driver's long-lived resources (e.g. the Windows persistent
    // PowerShell host) so the child process doesn't leak on app teardown.
    this.driver.dispose();
  }

  private buildContext(identity: McpThreadIdentity): ToolContext {
    const { threadId } = identity;
    return {
      driver: this.driver,
      ...(threadId
        ? {
            threadId,
            setSessionActive: (active: boolean) =>
              this.options.onActivity?.({
                kind: "session",
                threadId,
                active,
              }),
          }
        : {}),
    };
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<unknown> {
    if (!ctx.threadId || !isInteractiveToolName(name)) {
      return await dispatchTool(name, args, ctx);
    }
    const event = { threadId: ctx.threadId, toolName: normalizeToolName(name) };
    this.options.onActivity?.({ kind: "action", ...event, active: true });
    try {
      return await dispatchTool(name, args, ctx);
    } finally {
      this.options.onActivity?.({ kind: "action", ...event, active: false });
    }
  }
}
