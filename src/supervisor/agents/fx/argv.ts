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

/** Model, effort, and Fast flags, shared by Terminal launches and one-shots. */
export function fxModelArgs(selection: {
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
}): string[] {
  const args: string[] = [];
  if (selection.model) args.push("--model", selection.model);
  if (selection.effort) args.push("--effort", selection.effort);
  if (selection.fast === true) args.push("--fast");
  else if (selection.fast === false) args.push("--no-fast");
  return args;
}

export function buildFxArgs(config: ThreadConfig, resumeSessionId?: string): string[] {
  const args = fxModelArgs(config);
  // fx 0.0.15 rejects any flag after `--resume <id>` with its resume usage text.
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  return args;
}
