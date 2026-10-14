import type { ThreadConfig } from "@/shared/contracts";

/** One permission engine backs both terminal and native ACP sessions. */
export function resolveCommandCodePermissionMode(config: ThreadConfig): string {
  if (config.mode === "plan") return "plan";
  const policy = config.approvalPolicy;
  if (policy === "auto_edit") return "auto-accept";
  if (policy === "never" || policy === "yolo") return "bypass";
  return policy || "default";
}
