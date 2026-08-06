import type { ThreadConfig } from "@/shared/contracts";
import { QWEN_DEFAULT_MODEL_ID } from "@/shared/agents/qwenModels";

export { QWEN_DEFAULT_MODEL_ID } from "@/shared/agents/qwenModels";

function approvalModeFor(config: ThreadConfig): string {
  if (config.mode === "plan") return "plan";
  switch (config.approvalPolicy) {
    case "auto_edit":
    case "auto-edit":
      return "auto-edit";
    case "auto":
      return "auto";
    case "default":
      return "default";
    case "never":
    case "yolo":
    case "bypassPermissions":
      return "yolo";
    default:
      return "auto";
  }
}

export function buildQwenArgs(
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
  args.push("--model", config.model || QWEN_DEFAULT_MODEL_ID);
  args.push("--approval-mode", approvalModeFor(config));
  if (prompt.trim().length > 0) args.push("--prompt-interactive", prompt);
  return args;
}
