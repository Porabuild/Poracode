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

export interface ComputerUseTargetBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type ComputerUseActivityEvent =
  | { kind: "session"; threadId: string; active: boolean }
  | {
      kind: "action";
      threadId: string;
      active: boolean;
      toolName: string;
      delivery: "background" | "foreground";
      target?: string;
      targetBounds?: ComputerUseTargetBounds;
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
      serverInfo: { name: "computer_use", version: "0.2.0" },
      instructions: COMPUTER_USE_MCP_INSTRUCTIONS,
      tools: TOOLS,
      isKnownToolName,
      buildContext: (identity) => this.buildContext(identity),
      dispatchTool: (name, args, ctx) => this.dispatch(name, args, ctx),
      formatToolResult: (name, result) =>
        formatToolResult(name, result, { notes: this.backendNotes }),
    });
  }

  async start(): Promise<ComputerUseMcpIngressInfo> {
    const info = await this.ingress.start();
    void this.driver.describeStatus().catch(() => {});
    return info;
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
    // The activity window covers the input, not the optional post-action
    // observation: `dispatchTool` settles as soon as the input is delivered so a
    // capture cannot hold the takeover border up or keep Escape suppressed, and
    // so an unexpected foreground escalation surfaces immediately. `finally`
    // still settles the paths that never reach the hook (a thrown tool).
    let settled = false;
    const settle = (result: unknown): void => {
      if (settled) return;
      settled = true;
      let completedTarget: string | undefined;
      let completedTargetBounds: ComputerUseTargetBounds | undefined;
      if (delivery === "background" && this.wasDelivered(result, "background")) {
        completedTarget = target;
        completedTargetBounds = this.readTargetBounds(result) ?? this.readTargetBounds(args);
      }
      if (delivery === "background" && this.wasDelivered(result, "foreground")) {
        const escalated = { ...event, delivery: "foreground" as const };
        this.options.onActivity?.({ kind: "action", ...escalated, active: true });
        this.options.onActivity?.({ kind: "action", ...escalated, active: false });
      }
      this.options.onActivity?.({
        kind: "action",
        ...event,
        ...(completedTarget ? { target: completedTarget } : {}),
        ...(completedTargetBounds ? { targetBounds: completedTargetBounds } : {}),
        active: false,
      });
    };
    try {
      return await dispatchTool(name, args, { ...ctx, onInputSettled: settle });
    } finally {
      settle(undefined);
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

  private readTargetBounds(value: unknown): ComputerUseTargetBounds | undefined {
    if (!value || typeof value !== "object") return undefined;
    const window = (value as { window?: unknown }).window;
    if (!window || typeof window !== "object") return undefined;
    const { x, y, width, height } = window as Record<string, unknown>;
    if (![x, y, width, height].every((part) => typeof part === "number" && Number.isFinite(part))) {
      return undefined;
    }
    if ((width as number) <= 0 || (height as number) <= 0) return undefined;
    return { x: x as number, y: y as number, width: width as number, height: height as number };
  }

  private wasDelivered(result: unknown, expected: "background" | "foreground"): boolean {
    if (!result || typeof result !== "object") return false;
    const record = result as { delivery?: unknown; steps?: unknown };
    const delivery = record.delivery;
    if (
      Boolean(delivery) &&
      typeof delivery === "object" &&
      (delivery as { delivered?: unknown }).delivered === expected
    ) {
      return true;
    }
    return (
      Array.isArray(record.steps) &&
      record.steps.some(
        (step) =>
          step &&
          typeof step === "object" &&
          this.wasDelivered((step as { result?: unknown }).result, expected),
      )
    );
  }
}
