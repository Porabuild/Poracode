import type { SupervisorEvent } from "@/shared/ipc";
import type {
  AgentKind,
  McpServer,
  ProjectLocation,
  ThreadServerRequestId,
} from "@/shared/contracts";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";
import type { ComputerUseMcpHttpConfig } from "@/supervisor/agents/computerUseMcp";
import type { ChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";
import type {
  SubagentMcpHostAccessResolver,
  SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";
import type { AgentAdapter } from "../../agents/base";
import type { WindowsShellPreference } from "../../shellPreference";

export interface ThreadSessionManagerOptions {
  emit(event: SupervisorEvent): void;
  isDev: boolean;
  logsDir: string;
  settingsPath: string;
  readDisableCliHookPlugin(): boolean;
  adapters: Map<AgentKind, AgentAdapter>;
  windowsShell: WindowsShellPreference;
  /**
   * Optional: provides CLI hook plugin ingress env vars + extra CLI args injected
   * into every agent PTY spawn. The supervisor boots a single
   * `HookIngress` and exposes this hook so the manager doesn't depend on
   * `node:http` itself.
   */
  resolvePluginEnvForSpawn?(input: {
    threadId: string;
    agentKind: AgentKind;
    projectLocation: ProjectLocation;
    browserMcpEnabled?: boolean;
    browserMcp?: BrowserMcpHttpConfig;
    computerUseMcpEnabled?: boolean;
    computerUseMcp?: ComputerUseMcpHttpConfig;
    chromeMcpEnabled?: boolean;
    chromeMcp?: ChromeMcpHttpConfig;
    mcpServers?: McpServer[];
  }): Promise<{ env: Record<string, string>; extraArgs: string[] } | undefined>;
  wslBridge?: {
    ensureBridge(distro: string): Promise<{ baseUrl: string; secret: string } | undefined>;
  };
  /**
   * Optional: cross-provider subagents MCP hooks. When a thread launches with
   * `config.subagentMcp === true`, the manager registers it with the ingress
   * and threads the resulting http config into the structured session / launch
   * options. On interrupt + close it cancels the thread's child runs; on close
   * it also unregisters the thread. All heavy lifting lives in the subagentMcp
   * module — these are thin hooks only.
   */
  subagentMcp?: {
    register(threadId: string): SubagentMcpHttpConfig | undefined;
    unregister(threadId: string): void;
    cancelAll(threadId: string): void;
    /**
     * Try to route a server-request resolution to a subagent child run. Returns
     * `true` when the id belonged to a subagent (namespaced under a run) and was
     * handled; `false` to fall through to the normal session resolve path.
     */
    resolveChildRequest(requestId: ThreadServerRequestId, response: unknown): boolean;
  };
  /**
   * Optional: resolves how a WSL distro reaches host-bound services (NAT
   * gateway IP vs. mirrored-mode loopback) so subagents MCP URLs can be
   * rewritten — or left as-is — for agents launched inside a WSL distro (the
   * ingress binds `0.0.0.0` on Windows for this). Windows-only in practice;
   * absent/undefined on macOS/Linux, which makes the WSL rewrite path inert.
   */
  subagentMcpHostAccess?: SubagentMcpHostAccessResolver;
  /**
   * Optional: attaches stored OAuth `Authorization` headers to user-configured
   * HTTP/SSE MCP servers just before a launch fans them out to the provider
   * config builders. Tokens are refreshed by the supervisor's OAuth service.
   */
  applyMcpServerAuthorization?(servers: McpServer[]): Promise<McpServer[]>;
}
