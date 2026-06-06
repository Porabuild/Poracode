import type { AgentKind, ProjectLocation, ThreadPresentationMode } from "@/shared/contracts";

export type ComputerUseScope = "none" | "launch";

export function getComputerUseScope(
  agentKind: AgentKind,
  presentationMode: ThreadPresentationMode,
  projectLocation?: ProjectLocation,
): ComputerUseScope {
  if (projectLocation?.kind === "wsl") return "none";
  if (agentKind === "antigravity" || agentKind === "opencode") return "none";
  if (presentationMode === "gui") return "launch";
  return agentKind === "codex" ? "launch" : "none";
}
