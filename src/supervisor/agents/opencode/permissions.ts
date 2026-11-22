import type { SessionUpdateInput } from "./clientTypes";

export function sanitizeOpenCodeMcpId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

export interface OpenCodeMcpPermissionsFilter {
  /** MCP server names registered in the directory that this thread must NOT see. */
  deniedMcpServers?: readonly string[];
  /** Individual tools disabled within MCP servers enabled on this thread. */
  disabledMcpTools?: ReadonlyArray<{ server: string; tool: string }>;
}

/**
 * Session overrides isolate each thread's policy and per-thread MCP tool
 * access on the shared directory-scoped server. Rules are evaluated with
 * `findLast`, so catch-all rules come first and explicit denies follow.
 */
export function buildOpenCodeSessionPermissions(
  approvalPolicy: string | undefined,
  mcpFilter?: OpenCodeMcpPermissionsFilter,
): NonNullable<SessionUpdateInput["permissions"]> {
  const rules: Array<NonNullable<SessionUpdateInput["permissions"]>[number]> = [
    {
      action: "*",
      resource: "*",
      effect: approvalPolicy === "yolo" || approvalPolicy === "never" ? "allow" : "ask",
    },
    { action: "question", resource: "*", effect: "allow" },
  ];
  const deniedServers = [...new Set(mcpFilter?.deniedMcpServers ?? [])].sort();
  for (const server of deniedServers) {
    rules.push({
      action: `${sanitizeOpenCodeMcpId(server)}_*`,
      resource: "*",
      effect: "deny",
    });
  }
  const disabledTools = [
    ...new Map(
      (mcpFilter?.disabledMcpTools ?? []).map(({ server, tool }) => {
        const action = `${sanitizeOpenCodeMcpId(server)}_${sanitizeOpenCodeMcpId(tool)}`;
        return [action, { action, resource: "*", effect: "deny" as const }] as const;
      }),
    ).entries(),
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rule]) => rule);
  rules.push(...disabledTools);
  return rules;
}
