import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";

export const CONTROL_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  itemCase(
    "question_answer",
    "question_answer",
    {
      questions: [
        {
          header: "Fixture",
          question: "Choose fixture",
          selected: [{ label: "A", description: "Fixture A" }, { label: "B" }],
          customAnswer: "**Custom fixture answer**",
        },
      ],
    },
    "other",
    { groupEligible: false },
  ),
  toolCase(
    "plan_proposal",
    {
      name: "ExitPlanMode",
      status: "running",
      args: {
        plan: "# Fixture plan\n\n1. Inspect\n2. Verify",
        planFilePath: "/tmp/fixture-plan.md",
      },
    },
    "other",
    { planProposal: true, groupEligible: false },
  ),
  toolCase(
    "compaction",
    {
      name: "contextCompaction",
      status: "success",
      args: { trigger: "manual", pre_tokens: 120000, post_tokens: 30000, duration_ms: 2000 },
    },
    "other",
    { compaction: true, groupEligible: false },
  ),
  itemCase(
    "plan_dock",
    "plan",
    {
      steps: [
        { step: "Inspect", status: "in_progress" },
        { step: "Verify", status: "pending" },
        { step: "Done", status: "completed" },
      ],
    },
    "other",
    { visible: false, groupEligible: false },
    {},
    ["plan_goal_docks"],
  ),
  itemCase(
    "goal_dock",
    "goal",
    {
      action: "set",
      objective: "Fixture goal",
      status: "active",
      tokenBudget: 1000,
      tokensUsed: 50,
    },
    "other",
    { visible: false, groupEligible: false },
  ),
  itemCase(
    "error_item_hidden",
    "error",
    { message: "Fixture runtime failure", severity: "error" },
    "other",
    { visible: false, groupEligible: false },
  ),
  itemCase(
    "provider_handoff",
    "provider_handoff",
    { fromAgentKind: "fixture-old", toAgentKind: "fixture-new", at: "2026-10-01T00:00:00Z" },
    "other",
    { groupEligible: false },
  ),
  itemCase(
    "reasoning",
    "reasoning",
    { summary: "fixture thought" },
    "thought",
    {},
    { streams: { reasoning_text: "fixture reasoning-marker" } },
  ),
];

export const CONTROL_STATE_CASES = [
  ...(["paused", "budget_limited", "complete", "failed", "cancelled"] as const).map((status) =>
    itemCase(
      `goal-state:${status}`,
      "goal",
      { action: "updated", status, objective: "Fixture goal", tokensUsed: 50 },
      "other",
      { visible: false, groupEligible: false },
    ),
  ),
  ...(["updated", "viewed", "cleared"] as const).map((action) =>
    itemCase(
      `goal-action:${action}`,
      "goal",
      { action, objective: "Fixture goal", status: "active" },
      "other",
      { visible: false, groupEligible: false },
    ),
  ),
];
