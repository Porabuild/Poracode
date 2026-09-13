import type { PermissionRulesInput } from "./clientTypes";

/** Session overrides, supported by beta-19500+, isolate each thread's policy. */
export function buildOpenCode2SessionPermissions(
  approvalPolicy: string | undefined,
): PermissionRulesInput["permissions"] {
  return [
    {
      action: "*",
      resource: "*",
      effect: approvalPolicy === "yolo" || approvalPolicy === "never" ? "allow" : "ask",
    },
    { action: "question", resource: "*", effect: "allow" },
  ];
}
