import type { AgentKind, AgentStatusesResponse, ProjectLocation } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  resolveUnrestrictedPermissionConfig,
  type UnrestrictedPermissionConfig,
} from "@/shared/agents/unrestrictedPermissions";

/**
 * Resolve the most-permissive advertised permission policy for an agent in a
 * given location. Threads launched from automation (schedules, the app-controls
 * MCP) run their opening turn unattended — nobody is around to answer approval
 * prompts — so they launch with the provider's unrestricted posture (the same
 * capabilities-driven resolution the subagent lane uses; no provider-specific
 * branching). On a lookup failure or unknown agent, fall back to provider
 * defaults rather than failing the launch.
 */
export async function resolveUnrestrictedThreadPermissions(
  getAgentStatuses: (wslDistros: string[]) => Promise<AgentStatusesResponse>,
  agentKind: AgentKind,
  location: ProjectLocation,
): Promise<UnrestrictedPermissionConfig> {
  try {
    const statuses = await getAgentStatuses(location.kind === "wsl" ? [location.distro] : []);
    const agents = getProjectAgentStatuses(location, statuses.windows, statuses.wsl);
    const agent = agents.find((status) => status.kind === agentKind);
    if (!agent) return {};
    return resolveUnrestrictedPermissionConfig(agent.capabilities);
  } catch {
    return {};
  }
}
