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
    // Computer-use drives the host's real mouse/keyboard/windows, so the ingress
    // must never be reachable off the machine — bind loopback only (unlike the
    // browser ingress, which binds 0.0.0.0 for WSL reachability).
    bindHost: "127.0.0.1",
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
    // Release the driver's long-lived resources (e.g. the Windows persistent
    // PowerShell host) so the child process doesn't leak on app teardown.
    this.driver.dispose?.();
  }

  private buildContext(): ToolContext {
    return { driver: this.driver };
  }
}
