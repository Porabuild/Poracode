import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";

export const DELEGATION_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  toolCase(
    "subagent_flagged",
    {
      name: "FixtureChild",
      args: { description: "Inspect fixture", prompt: "Fixture only" },
      isSubAgent: true,
      subAgentStatus: "running",
      status: "running",
      progress: {
        description: "Inspect fixture",
        model: "fixture-model",
        effort: "high",
        stepCount: 3,
        tokens: 120,
        toolUses: 2,
        durationMs: 250,
      },
    },
    "executed",
    { subagent: true, groupEligible: false },
  ),
  itemCase(
    "subagent_nested_child",
    "tool_call",
    { name: "FixtureInner", isSubAgent: true, status: "running" },
    "executed",
    { subagent: true, groupEligible: false },
    { state: "started", parentItemId: "subagent_flagged" },
  ),
  toolCase(
    "subagent_detached",
    {
      name: "FixtureChild",
      args: { run_in_background: true },
      isSubAgent: true,
      status: "running",
      progress: { description: "Background work", stepCount: 20 },
    },
    "executed",
    { subagent: true, groupEligible: false },
  ),
  ...(["completed", "failed", "cancelled", "paused"] as const).map((subAgentStatus) =>
    toolCase(
      `subagent_${subAgentStatus}`,
      {
        name: "FixtureChild",
        isSubAgent: true,
        subAgentStatus,
        status: subAgentStatus === "failed" || subAgentStatus === "cancelled" ? "error" : "success",
        result: `# ${subAgentStatus}\n\nfixture-final-marker`,
        progress: { stepCount: 3, tokens: 120, toolUses: 2, durationMs: 250 },
      },
      "executed",
      { subagent: true, groupEligible: false },
    ),
  ),
  toolCase(
    "subagent_resume",
    {
      name: "SendMessage",
      title: "Continue fixture inspection",
      isSubAgent: true,
      isSubAgentResume: true,
      subAgentType: "fixture-worker",
      status: "running",
      progress: { stepCount: 0 },
    },
    "executed",
    {
      subagent: true,
      groupEligible: false,
      title: "Agent Resume (fixture-worker): Continue fixture inspection",
      icon: "Bot",
    },
  ),
  toolCase(
    "crossagent_flagged",
    {
      name: "Fixture Worker",
      isCrossagent: true,
      crossagentStatus: "running",
      status: "running",
      progress: { stepCount: 3 },
    },
    "executed",
    { crossagent: true, subagent: false, groupEligible: false },
  ),
  itemCase(
    "crossagent_forwarded_child",
    "command_execution",
    { command: "fixture child command", status: "success" },
    "executed",
    {},
    { parentItemId: "crossagent_flagged", streams: { command_output: "child-end-marker" } },
  ),
  itemCase(
    "crossagent_spawn_transport",
    "mcp_tool_call",
    {
      name: "mcp__crossagents__spawn_agent",
      args: { prompt: "Fixture only" },
      result: { run_id: "run_fixture" },
      status: "success",
    },
    "mcp",
    { visible: false, spawnTransport: true },
  ),
];

export const CROSSAGENT_STATE_CASES = (
  ["running", "completed", "failed", "cancelled"] as const
).map((crossagentStatus) =>
  toolCase(
    `crossagent-state:${crossagentStatus}`,
    {
      name: "Fixture Worker",
      isCrossagent: true,
      crossagentStatus,
      status:
        crossagentStatus === "running"
          ? "running"
          : crossagentStatus === "failed" || crossagentStatus === "cancelled"
            ? "error"
            : "success",
      progress: { stepCount: 3 },
      result: `${crossagentStatus}-marker`,
    },
    "executed",
    { crossagent: true, subagent: false, groupEligible: false },
  ),
);
