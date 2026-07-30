import type { Thread } from "@/shared/contracts";
import type { ScheduleService } from "../schedules/ScheduleService";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../mcp/StreamableHttpMcpIngress";
import {
  APP_CONTROLS_MCP_INSTRUCTIONS,
  TOOLS,
  dispatchTool,
  formatToolResult,
  isKnownToolName,
  type AppControlsScheduleRunControls,
  type AppControlsToolContext,
} from "./mcp/toolRegistry";

export type AppControlsMcpIngressInfo = StreamableHttpMcpIngressInfo;

export class AppControlsMcpIngress {
  private readonly ingress: StreamableHttpMcpIngress<AppControlsToolContext>;

  constructor(
    scheduleService: ScheduleService,
    getThread: (threadId: string) => Thread | null,
    scheduleRuns: AppControlsScheduleRunControls,
  ) {
    this.ingress = new StreamableHttpMcpIngress<AppControlsToolContext>({
      serverInfo: { name: "poracode", version: "1.0.0" },
      instructions: APP_CONTROLS_MCP_INSTRUCTIONS,
      tools: TOOLS,
      isKnownToolName,
      buildContext: (identity) => ({ identity, scheduleService, scheduleRuns, getThread }),
      dispatchTool,
      formatToolResult,
    });
  }

  start(): Promise<AppControlsMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): AppControlsMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  dispose(): void {
    this.ingress.dispose();
  }
}
