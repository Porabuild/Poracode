import type { ToolCallPayload } from "@/shared/contracts";

export interface MuseSubagentIdentity {
  title?: string;
  type?: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function subagentId(record: Record<string, unknown>): string | undefined {
  return (
    stringValue(record["subagent_id"]) ??
    stringValue(record["id"]) ??
    stringValue(record["subagentId"]) ??
    stringValue(record["agentId"]) ??
    stringValue(record["subagent"])
  );
}

/** Normalize native tool identities without teaching shared UI Muse's argument names. */
export function museSubagentPayload(
  subagents: Map<string, MuseSubagentIdentity>,
  name: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  status: ToolCallPayload["status"],
): Partial<ToolCallPayload> {
  if (!name.startsWith("subagent_")) return {};
  const spawning = name === "subagent_spawn";
  // Spawn assigns the id in its result, while companion calls take it as an arg.
  const agentId = subagentId(args) ?? (spawning ? subagentId(result) : undefined);
  const previous = agentId ? subagents.get(agentId) : undefined;
  const title =
    stringValue(args["task_name"]) ??
    stringValue(args["role"]) ??
    stringValue(args["description"]) ??
    previous?.title;
  const type =
    stringValue(args["agent"]) ??
    stringValue(args["agentType"]) ??
    stringValue(args["type"]) ??
    previous?.type;
  if (spawning && agentId && (title || type)) {
    subagents.set(agentId, {
      ...(title ? { title } : {}),
      ...(type ? { type } : {}),
    });
  }
  const displayTitle = title ?? agentId;
  return {
    isSubAgent: true,
    ...(spawning ? {} : { isSubAgentResume: true }),
    ...(displayTitle ? { title: displayTitle } : {}),
    ...(type ? { subAgentType: type } : {}),
    subAgentStatus: status === "running" ? "running" : status === "error" ? "failed" : "completed",
  };
}
