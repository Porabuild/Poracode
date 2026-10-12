import type { ToolCallPayload, WorkflowRun } from "@/shared/contracts";
import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";
import { EDIT_PATH, TAXONOMY_NOW } from "./core";

const WORKFLOW_SCRIPT =
  "const meta = { description: 'Fixture phases', phases: [{ title: 'Inspect', detail: 'Read inputs' }, { title: 'Verify', detail: 'Check outputs' }] };";
const wf: ToolCallPayload = {
  name: "Workflow",
  status: "success",
  args: { script: WORKFLOW_SCRIPT },
  workflow: {
    name: "fixture-workflow",
    runId: "wf_fixture",
    summary: "Fixture phases",
    transcriptDir: "/tmp/fixture-session/subagents/workflows/wf_fixture",
    scriptPath: "/tmp/fixture-session/workflow.js",
    liveDescriptions: ["Inspect: worker-a", "Verify: worker-b", "Inspect: worker-a", "Narration"],
  },
};

export const WORKFLOW_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  toolCase("workflow_manifest", wf, "executed", {
    workflow: true,
    subagent: true,
    groupEligible: false,
  }),
  toolCase(
    "workflow_results",
    {
      name: "Workflow",
      status: "success",
      result: {
        findings: [
          { title: "finding-one", description: "**detail marker**", severity: "nit" },
          { title: "finding-two", description: "second detail", file: EDIT_PATH },
        ],
      },
    },
    "executed",
    { workflow: true, groupEligible: false },
  ),
  toolCase(
    "workflow_manifest_chat",
    {
      name: "Workflow",
      status: "running",
      workflow: {
        runId: "wf_fixture",
        transcriptDir: "/tmp/fixture-session/subagents/workflows/wf_fixture",
      },
    },
    "executed",
    { workflow: true, groupEligible: false },
  ),
  itemCase(
    "workflow_dag_mcp_display",
    "mcp_tool_call",
    {
      name: "mcp__crossagents__run_workflow",
      args: {
        tasks: [
          { id: "a", prompt: "Fixture inspect", write_scope: [] },
          { id: "b", prompt: "Fixture verify", depends_on: ["a"], write_scope: [] },
        ],
        background: true,
      },
      result: {
        workflow_id: "wf_host_fixture",
        status: "completed",
        tasks: [
          { id: "a", status: "completed", run_id: "run_a" },
          { id: "b", status: "completed", run_id: "run_b" },
        ],
      },
      status: "success",
    },
    "mcp",
    { workflow: false, spawnTransport: false },
  ),
];

export const WORKFLOW_RUN_CASES: readonly { id: string; run: WorkflowRun; live: boolean }[] = [
  ...(["running", "completed", "failed", "cancelled", "unknown"] as const).map((status) => ({
    id: `workflow-run:${status}`,
    live: status === "running" || status === "unknown",
    run: {
      runId: `wf_${status}`,
      status,
      startTime: TAXONOMY_NOW - 1000,
      agentCount: 5,
      phases: [
        {
          title: "Inspect",
          agents: (["queued", "running", "done", "failed", "cancelled"] as const).map(
            (state, i) => ({
              agentId: `worker-${i}`,
              label: `worker-${i}`,
              state,
              phaseIndex: 0,
              queuedAt: TAXONOMY_NOW - 1000,
              lastProgressAt: TAXONOMY_NOW - 500,
            }),
          ),
        },
      ],
      unphasedAgents: [],
    },
  })),
  {
    id: "workflow-run:stale",
    live: false,
    run: {
      runId: "wf_stale",
      status: "running",
      startTime: TAXONOMY_NOW - 4 * 60 * 60 * 1000,
      agentCount: 0,
      phases: [],
      unphasedAgents: [],
    },
  },
];
