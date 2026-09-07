import type { AgentCapability, ProjectLocation, ThreadPresentationMode } from "@/shared/contracts";
import { resolveMcpScope } from "./composerMcpServers";

export type ComputerUseScope = "none" | "launch";

/**
 * Whether Computer Use can be opted into for a thread. Providers declare their
 * per-presentation gating via `AgentCapability.mcpScope`; the
 * cross-cutting host checks live here:
 *
 * - WSL projects are excluded — agents run inside the distro and can't reach
 *   the host desktop ingress.
 *
 * Remote/mobile sessions are allowed — agents still spawn on the paired
 * desktop and talk to its loopback Computer Use MCP, so a phone can drive the
 * host desktop.
 */
export function getComputerUseScope(
  capabilities: Pick<AgentCapability, "mcpScope">,
  presentationMode: ThreadPresentationMode,
  projectLocation?: ProjectLocation,
): ComputerUseScope {
  if (projectLocation?.kind === "wsl") return "none";
  // The composer toggle only distinguishes "available" from "hidden", so the
  // mid-thread-toggleable "always" scope collapses to "launch".
  return resolveMcpScope(capabilities.mcpScope, presentationMode) === "none" ? "none" : "launch";
}
