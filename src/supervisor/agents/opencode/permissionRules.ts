import type { PermissionRule } from "@opencode-ai/sdk/v2";

/**
 * Build the Poracode-owned permission override for OpenCode sessions.
 *
 * Supervised mode intentionally returns undefined so OpenCode resolves
 * permissions from its normal global + project config stack.
 */
export function buildOpenCodePermissionRules(
  approvalPolicy: string | undefined,
): PermissionRule[] | undefined {
  const isFullAccess = approvalPolicy === "yolo" || approvalPolicy === "never";
  if (!isFullAccess) return undefined;

  return [{ permission: "*", pattern: "*", action: "allow" }];
}
