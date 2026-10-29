import type { ThreadConfig } from "@/shared/contracts";
import { isFullBypassApprovalPolicy } from "@/shared/agents/unrestrictedPermissions";

export type FxPermissionMode = "auto" | "ask" | "full-access";

/** Map Poracode's approval policy onto fx's FX_PERMISSION_MODE vocabulary. */
export function fxPermissionModeFor(approvalPolicy?: string): FxPermissionMode {
  if (isFullBypassApprovalPolicy(approvalPolicy) || approvalPolicy === "full-access") {
    return "full-access";
  }
  if (approvalPolicy === "ask") return "ask";
  return "auto";
}

/** Permission mode rides the spawn env: fx has no launch flag for it. */
export function buildFxLaunchEnv(config: ThreadConfig): { FX_PERMISSION_MODE: FxPermissionMode } {
  return { FX_PERMISSION_MODE: fxPermissionModeFor(config.approvalPolicy) };
}

export function buildFxArgs(config: ThreadConfig, resumeSessionId?: string): string[] {
  const args: string[] = [];
  if (config.model) args.push("--model", config.model);
  if (config.effort) args.push("--effort", config.effort);
  if (config.fast === true) args.push("--fast");
  else if (config.fast === false) args.push("--no-fast");
  // fx 0.0.15 rejects any flag after `--resume <id>` with its resume usage text.
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  return args;
}
