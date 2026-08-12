import type { SupervisorEvent } from "@/shared/ipc";
import type {
  AgentKind,
  BuiltInMcpServerId,
  McpServer,
  ResolvedMcpServer,
  ProjectLocation,
  PromptSegment,
  ThreadServerRequestId,
  ThreadPresentationMode,
} from "@/shared/contracts";
import type { CrossagentMcpHttpConfig } from "@/supervisor/agents/crossagentMcp";
import type { WslHostAccessResolver } from "@/supervisor/wsl/hostAccess";
import type { AgentAdapter, AgentNativePlugin } from "../../agents/base";
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
    mcpServers?: readonly ResolvedMcpServer[];
  }): Promise<{ env: Record<string, string>; extraArgs: string[] } | undefined>;
  wslBridge?: {
    ensureBridge(distro: string): Promise<{ baseUrl: string; secret: string } | undefined>;
  };
  /**
   * Optional: Crossagents MCP hooks. When a thread launches with
   * `config.crossagentMcp === true`, the manager registers it with the ingress
   * and threads the resulting http config into the structured session / launch
   * options. An interrupt cancels turn-scoped children while preserving explicit
   * background runs; close cancels everything and unregisters the thread. All
   * heavy lifting lives in the crossagentMcp module — these are thin hooks only.
   */
  crossagentMcp?: {
    register(
      threadId: string,
      disabledTools?: readonly string[],
    ): CrossagentMcpHttpConfig | undefined;
    registerProviderSession(
      threadId: string,
      disabledTools?: readonly string[],
    ): CrossagentMcpHttpConfig | undefined;
    unregister(threadId: string): void;
    cancelForeground(threadId: string): void;
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
   * gateway IP vs. mirrored-mode loopback) so built-in MCP URLs can be
   * rewritten — or left as-is — for agents launched inside a WSL distro.
   * Windows-only in practice; absent/undefined on macOS/Linux, which makes the
   * WSL rewrite path inert.
   */
  wslHostAccess?: WslHostAccessResolver;
  /**
   * Optional: attaches stored OAuth `Authorization` headers to user-configured
   * HTTP/SSE MCP servers just before a launch fans them out to the provider
   * config builders. Tokens are refreshed by the supervisor's OAuth service.
   */
  applyMcpServerAuthorization?(servers: McpServer[]): Promise<McpServer[]>;
  /** Skills and MCPs contributed by enabled Agent Plugins for one provider launch. */
  resolvePluginLaunchContributions?(
    projectLocation: ProjectLocation,
    agentKind: AgentKind,
  ): Promise<{
    mcpServers: McpServer[];
    builtInMcpServerIds: BuiltInMcpServerId[];
    nativePlugins: AgentNativePlugin[];
  }>;
  /** Wrap servers with disabled tools in Poracode's same-environment filtering proxy. */
  prepareMcpToolFilters?(
    servers: McpServer[],
    projectLocation: ProjectLocation,
  ): Promise<McpServer[]>;
  /** Synchronize Poracode-owned provider skill projections before a new agent process starts. */
  prepareSkillsForLaunch?(projectLocation: ProjectLocation, agentKind: AgentKind): Promise<void>;
  /** Enforce plugin skill policy before a segment reaches a provider. */
  filterPluginSkillSegments?(input: {
    agentKind: AgentKind;
    projectLocation: ProjectLocation;
    presentationMode?: ThreadPresentationMode;
    nativePlugins?: readonly AgentNativePlugin[];
    segments: PromptSegment[];
  }): Promise<PromptSegment[]>;
  /**
   * Portable-skills fallback for structured turns: returns inline SKILL.md
   * instructions for skill segments the provider can't load natively, or
   * `undefined` when nothing needs inlining. Must never throw.
   */
  buildSkillTurnInjection?(input: {
    agentKind: AgentKind;
    projectLocation: ProjectLocation;
    segments: readonly PromptSegment[];
    nativePlugins?: readonly AgentNativePlugin[];
  }): Promise<string | undefined>;
  /**
   * Portable-skills fallback for terminal (PTY) turns: replaces skill segments
   * the agent's CLI can't resolve natively with a short path-hint sentence.
   * Must never throw; returns the segments to type.
   */
  rewriteTerminalSkillSegments?(input: {
    agentKind: AgentKind;
    projectLocation: ProjectLocation;
    segments: PromptSegment[];
    nativePlugins?: readonly AgentNativePlugin[];
  }): Promise<PromptSegment[]>;
}
