import type { ThreadConfig } from "@/shared/contracts";

export const QODER_DEFAULT_MODEL_ID = "auto";

/**
 * Map Poracode config to qodercli `--permission-mode` values. The CLI accepts
 * default | accept_edits | bypass_permissions | dont_ask | auto | plan, and
 * the ACP surface advertises the matching Default / Accept Edits / Bypass
 * Permissions / Plan modes. Approval-policy aliases cover configs carried
 * over from threads created under other providers.
 */
function permissionModeFor(config: ThreadConfig): string {
  if (config.mode === "plan") return "plan";
  switch (config.approvalPolicy) {
    case "acceptEdits":
    case "auto_edit":
    case "auto-edit":
      return "accept_edits";
    case "bypassPermissions":
    case "never":
    case "yolo":
      return "bypass_permissions";
    case "auto":
      return "auto";
    case "dont_ask":
      return "dont_ask";
    default:
      return "default";
  }
}

export function buildQoderArgs(
  config: ThreadConfig,
  prompt: string,
  resumeSessionId?: string,
  assignedSessionId?: string,
): string[] {
  const args: string[] = [];
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else if (assignedSessionId) {
    args.push("--session-id", assignedSessionId);
  }
  args.push("--model", config.model || QODER_DEFAULT_MODEL_ID);
  args.push("--permission-mode", permissionModeFor(config));
  if (config.effort) {
    args.push("--reasoning-effort", config.effort);
  }
  if (prompt.trim().length > 0) args.push("--prompt-interactive", prompt);
  return args;
}
