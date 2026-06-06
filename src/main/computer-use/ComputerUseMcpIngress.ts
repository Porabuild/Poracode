import { createComputerUseDriver } from "./drivers";
import {
  StreamableHttpMcpIngress,
  type StreamableHttpMcpIngressInfo,
} from "../mcp/StreamableHttpMcpIngress";
import {
  COMPUTER_USE_MCP_INSTRUCTIONS,
  TOOLS,
  dispatchTool,
  formatToolResult,
  isKnownToolName,
  type ToolContext,
} from "./mcp/toolRegistry";

export type ComputerUseMcpIngressInfo = StreamableHttpMcpIngressInfo;

export class ComputerUseMcpIngress {
  private readonly driver = createComputerUseDriver();
  private readonly ingress = new StreamableHttpMcpIngress<ToolContext>({
    serverInfo: { name: "computer_use", version: "0.1.0" },
    instructions: COMPUTER_USE_MCP_INSTRUCTIONS,
    tools: TOOLS,
    isKnownToolName,
    buildContext: () => this.buildContext(),
    dispatchTool,
    formatToolResult,
  });

  start(): Promise<ComputerUseMcpIngressInfo> {
    return this.ingress.start();
  }

  getInfo(): ComputerUseMcpIngressInfo | null {
    return this.ingress.getInfo();
  }

  dispose(): void {
    this.ingress.dispose();
  }

  private buildContext(): ToolContext {
    return { driver: this.driver };
  }
}
