import type { SessionUpdateInput } from "./clientTypes";

/** Session overrides isolate each thread's policy. */
export function buildOpenCode2SessionPermissions(
  approvalPolicy: string | undefined,
): NonNullable<SessionUpdateInput["permissions"]> {
  return [
    {
      action: "*",
      resource: "*",
      effect: approvalPolicy === "yolo" || approvalPolicy === "never" ? "allow" : "ask",
    },
    { action: "question", resource: "*", effect: "allow" },
  ];
}
