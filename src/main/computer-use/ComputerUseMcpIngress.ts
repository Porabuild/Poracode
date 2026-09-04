import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import { createComputerUseDriver, type CreateComputerUseDriverOptions } from "./drivers";
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
  resolveActivityDelivery,
  type ToolContext,
} from "./mcp/toolRegistry";

export type ComputerUseMcpIngressInfo = StreamableHttpMcpIngressInfo;

export type ComputerUseActivityEvent =
  | { kind: "session"; threadId: string; active: boolean }
  | {
      kind: "action";
      threadId: string;
      active: boolean;
      toolName: string;
      delivery: "background" | "foreground";
      target?: string;
    };

export interface ComputerUseMcpIngressOptions {
  driver?: ComputerUseDriver;
  driverOptions?: CreateComputerUseDriverOptions;
  onActivity?: (event: ComputerUseActivityEvent) => void;
}

export class ComputerUseMcpIngress {
  private backendNotes: string[] = [];
  private readonly driver: ComputerUseDriver;
  private readonly ingress: StreamableHttpMcpIngress<ToolContext>;

  constructor(private readonly options: ComputerUseMcpIngressOptions = {}) {
    const configuredWarn = options.driverOptions?.warn;
    this.driver =
      options.driver ??
      createComputerUseDriver({
        ...options.driverOptions,
        warn: (message) => {
          this.backendNotes = [message];
          configuredWarn?.(message);
        },
      });
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
      formatToolResult: (name, result) =>
        formatToolResult(name, result, { notes: this.backendNotes }),
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
    const delivery = resolveActivityDelivery(name, args);
    const target = this.readTarget(args);
    const event = {
      threadId: ctx.threadId,
      toolName: normalizeToolName(name),
      delivery,
    };
    this.options.onActivity?.({ kind: "action", ...event, active: true });
    let completedTarget: string | undefined;
    try {
      const result = await dispatchTool(name, args, ctx);
      if (delivery === "background" && this.wasDelivered(result, "background")) {
        completedTarget = target;
      }
      if (delivery === "background" && this.wasDeliveredForeground(result)) {
        const escalated = { ...event, delivery: "foreground" as const };
        this.options.onActivity?.({ kind: "action", ...escalated, active: true });
        this.options.onActivity?.({ kind: "action", ...escalated, active: false });
      }
      return result;
    } finally {
      this.options.onActivity?.({
        kind: "action",
        ...event,
        ...(completedTarget ? { target: completedTarget } : {}),
        active: false,
      });
    }
  }

  private readTarget(args: Record<string, unknown>): string | undefined {
    const window =
      args.window && typeof args.window === "object"
        ? (args.window as Record<string, unknown>)
        : undefined;
    const app =
      typeof window?.app === "string" ? window.app : typeof args.app === "string" ? args.app : "";
    if (!app) return undefined;
    const leaf = app.split(/[\\/]/u).at(-1) ?? app;
    return leaf.replace(/\.[^.]+$/u, "") || leaf;
  }

  private wasDeliveredForeground(result: unknown): boolean {
    return this.wasDelivered(result, "foreground");
  }

  private wasDelivered(result: unknown, expected: "background" | "foreground"): boolean {
    if (!result || typeof result !== "object") return false;
    const delivery = (result as { delivery?: unknown }).delivery;
    return (
      Boolean(delivery) &&
      typeof delivery === "object" &&
      (delivery as { delivered?: unknown }).delivered === expected
    );
  }
}
