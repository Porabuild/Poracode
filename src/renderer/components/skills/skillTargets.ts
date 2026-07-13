import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { SkillScope } from "@/shared/contracts";
import {
  GLOBAL_MCP_DESTINATION_ID,
  MCP_PROJECT_DESTINATION_PREFIX,
  MCP_WSL_DESTINATION_PREFIX,
  type McpProjectDestination,
} from "@/renderer/components/mcp/McpProjectDestinationDropdown";

export interface SkillTarget {
  id: string;
  scope: SkillScope;
  project?: McpProjectDestination;
  wslDistro?: string;
}

export function resolveSkillTarget(
  id: string,
  projects: readonly McpProjectDestination[],
): SkillTarget {
  if (id.startsWith(MCP_WSL_DESTINATION_PREFIX)) {
    const distro = id.slice(MCP_WSL_DESTINATION_PREFIX.length);
    if (distro) return { id, scope: "global", wslDistro: distro };
  }
  if (id.startsWith(MCP_PROJECT_DESTINATION_PREFIX)) {
    const project = projects.find(
      (candidate) => candidate.id === id.slice(MCP_PROJECT_DESTINATION_PREFIX.length),
    );
    if (project) {
      return {
        id,
        scope: "project",
        project,
      };
    }
  }
  return { id: GLOBAL_MCP_DESTINATION_ID, scope: "global" };
}

/** Label for the host machine's global skill scope, tailored to the host OS. */
export function hostGlobalScopeLabel(platform: string): MessageDescriptor {
  return platform === "darwin"
    ? msg`Global (macOS)`
    : platform === "linux"
      ? msg`Global (Linux)`
      : msg`Global (Windows)`;
}

export function skillTargetRequest(target: SkillTarget) {
  return {
    ...(target.project ? { projectLocation: target.project.location } : {}),
    ...(target.wslDistro ? { wslDistro: target.wslDistro } : {}),
  };
}
