import type {
  AgentCapability,
  ProjectLocation,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { composerMcpServers, providerOwnsMcpConfig } from "./composerMcpServers";
import { getComputerUseScope } from "./computerUseScope";

/** `mcpScope` stand-in that only answers the host/project checks, never gating. */
const ALWAYS_SCOPED: Pick<AgentCapability, "mcpScope"> = {
  mcpScope: { terminal: "launch", gui: "launch" },
};

/**
 * The per-thread MCP servers a handoff carries into the target provider.
 *
 * A switch continues the same task, so every server the user turned on for it
 * comes along. The launch path gates each one on its thread-config flag alone
 * (`resolve*McpForLaunch` reads `config.browserMcp`, `config.chromeMcp`, …), so
 * a flag is worth carrying to any provider — including one whose `mcpScope` is
 * "none". That scope only says the provider's composer offers no toggle; the
 * server still starts and the agent still gets it.
 *
 * Two things genuinely cannot honor a carried flag, and only those are dropped:
 *
 * - a provider that owns its MCP config on its settings page
 *   (`mcpConfigSource: "agentSettings"`), where per-thread flags are replaced by
 *   that provider's settings at launch;
 * - a server the *project* cannot reach — Chrome and Computer Use in a WSL
 *   project. The launch resolvers drop those anyway; carrying them would only
 *   leave a chip for a server that never runs.
 *
 * Custom (user and project) MCP servers are not per-thread config: they are
 * resolved from settings at launch, so they follow the thread on their own.
 */
export function carryOverComposerMcpConfig(
  capabilities: AgentCapability,
  presentationMode: ThreadPresentationMode,
  source: Pick<ThreadConfig, "browserMcp" | "chromeMcp" | "crossagentMcp" | "computerUse">,
  projectLocation?: ProjectLocation,
): Partial<ThreadConfig> {
  if (providerOwnsMcpConfig(capabilities)) return {};
  const carried: Partial<ThreadConfig> = {};
  for (const descriptor of composerMcpServers) {
    if (source[descriptor.configKey] !== true) continue;
    if (!descriptor.isAvailable(projectLocation)) continue;
    carried[descriptor.configKey] = true;
  }
  if (
    source.computerUse === true &&
    getComputerUseScope(ALWAYS_SCOPED, presentationMode, projectLocation) !== "none"
  ) {
    carried.computerUse = true;
  }
  return carried;
}

/**
 * Just the composer MCP toggles, so a config can be reseeded from another one
 * without dragging its model or approval choices along. Explicit false values
 * keep a saved provider draft from turning a server back on after the user
 * disabled it in the handoff dialog.
 */
export function composerMcpConfig(config: ThreadConfig): Partial<ThreadConfig> {
  return {
    browserMcp: config.browserMcp === true,
    chromeMcp: config.chromeMcp === true,
    crossagentMcp: config.crossagentMcp === true,
    computerUse: config.computerUse === true,
  };
}
