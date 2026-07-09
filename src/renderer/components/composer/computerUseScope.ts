import type { AgentCapability, ProjectLocation, ThreadPresentationMode } from "@/shared/contracts";
import { resolveMcpScope } from "./composerMcpServers";

export type ComputerUseScope = "none" | "launch";

/**
 * Whether Computer Use can be opted into for a thread. Providers declare their
 * per-presentation gating via `AgentCapability.computerUseMcpScope`; the
 * cross-cutting host checks live here:
 *
 * - Host platform matters: the MCP ingress only starts on win32/darwin, so
 *   Linux must hide the toggle (otherwise it looks enabled but is a silent
 *   no-op).
 * - WSL projects are excluded — agents run inside the distro and can't reach
 *   the host desktop ingress.
 *
 * Remote/mobile sessions are allowed — agents still spawn on the paired
 * desktop and talk to its loopback Computer Use MCP, so a phone can drive the
 * host desktop. Callers must pass the *desktop* host platform (not the phone
 * UA); see the mobile bridge's `setRemoteBridgeClient(..., platform)`.
 */
export function getComputerUseScope(
  capabilities: Pick<AgentCapability, "computerUseMcpScope">,
  presentationMode: ThreadPresentationMode,
  projectLocation?: ProjectLocation,
  hostPlatform?: NodeJS.Platform,
): ComputerUseScope {
  if (hostPlatform === "linux") return "none";
  if (projectLocation?.kind === "wsl") return "none";
  // The composer toggle only distinguishes "available" from "hidden", so the
  // mid-thread-toggleable "always" scope collapses to "launch".
  return resolveMcpScope(capabilities.computerUseMcpScope, presentationMode) === "none"
    ? "none"
    : "launch";
}
