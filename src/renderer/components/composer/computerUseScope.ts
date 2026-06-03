import type { AgentKind, ThreadPresentationMode } from "@/shared/contracts";

export type ComputerUseScope = "none" | "launch";

export function getComputerUseScope(
  agentKind: AgentKind,
  presentationMode: ThreadPresentationMode,
): ComputerUseScope {
  if (agentKind === "antigravity" || agentKind === "opencode") return "none";
  if (presentationMode === "gui") return "launch";
  return agentKind === "codex" ? "launch" : "none";
}
