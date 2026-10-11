// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { describe, expect, it } from "vitest";
import { isWorkflowRunLive, workflowRunSchema } from "@/shared/contracts/workflowTranscript";
import {
  isCrossagentSpawnAgentTool,
  isDelegatedAgentTool,
  isWorkflowTool,
  parseMcpName,
} from "@/shared/toolCallClassification";
import {
  selectActiveSubAgentParentItemIds,
  selectThreadHasActiveNativeSubAgent,
} from "@/renderer/state/subAgentSelectors";
import { categorizeItem } from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";
import { deriveToolDisplay } from "@/renderer/components/thread/ChatPane/parts/items/toolDisplay";
import { parseWorkflowInfo } from "@/renderer/components/thread/ChatPane/parts/items/workflowDisplay";
import { TAXONOMY_NOW, taxonomyItem, WORKFLOW_RUN_CASES } from "../fixtures/tool-taxonomy-workload";
import { payload, selectorState } from "./tool-taxonomy/test-support";

describe("delegated and workflow display state, with origin explicitly unqualified", () => {
  it("uses typed flags/argument capabilities rather than raw Task/Agent names", () => {
    expect(isDelegatedAgentTool(payload("task_name_only"))).toBe(false);
    expect(isDelegatedAgentTool(payload("name:Agent"))).toBe(false);
    expect(isDelegatedAgentTool(payload("subagent_flagged"))).toBe(true);
    expect(isDelegatedAgentTool(payload("subagent_resume"))).toBe(true);
    expect(deriveToolDisplay(payload("subagent_resume")).title).toBe(
      "Agent Resume (fixture-worker): Continue fixture inspection",
    );
    expect(deriveToolDisplay(payload("crossagent_flagged"), { bareAgentTitle: true }).title).toBe(
      "Fixture Worker",
    );
  });

  it("root activity selectors exclude nested/settled agents and replayed workflows", () => {
    const root = taxonomyItem("subagent_flagged");
    const child = taxonomyItem("subagent_nested_child");
    const settled = taxonomyItem("subagent_completed");
    const liveWorkflow = { ...taxonomyItem("workflow_manifest"), observedLive: true };
    const replayedWorkflow = {
      ...taxonomyItem("workflow_manifest_chat", ":replayed"),
      observedLive: false,
    };
    const threadId = "taxonomy-activity";
    const state = selectorState([root, child, settled, liveWorkflow, replayedWorkflow], threadId);
    expect(selectActiveSubAgentParentItemIds(state, threadId)).toEqual([root.id, liveWorkflow.id]);
    expect(selectThreadHasActiveNativeSubAgent(state, threadId)).toBe(true);
    const workflows = selectorState([liveWorkflow, replayedWorkflow], "taxonomy-workflow-only");
    expect(selectThreadHasActiveNativeSubAgent(workflows, "taxonomy-workflow-only")).toBe(false);
  });

  it.each(WORKFLOW_RUN_CASES)(
    "$id: matches manifest liveness and all declared agent states",
    ({ run, live }) => {
      expect(workflowRunSchema.safeParse(run).success).toBe(true);
      expect(isWorkflowRunLive(run, { now: TAXONOMY_NOW })).toBe(live);
    },
  );

  it("parses structured workflow phases, deduplicates live labels, and keeps host DAG generic", () => {
    expect(parseWorkflowInfo(payload("workflow_manifest"))).toEqual({
      description: "Fixture phases",
      runId: "wf_fixture",
      transcriptDir: "/tmp/fixture-session/subagents/workflows/wf_fixture",
      manifestPath: "/tmp/fixture-session/workflows/wf_fixture.json",
      phases: [
        { title: "Inspect", detail: "Read inputs" },
        { title: "Verify", detail: "Check outputs" },
      ],
      plannedAgents: [],
      liveAgents: [
        { label: "worker-a", phaseTitle: "Inspect" },
        { label: "worker-b", phaseTitle: "Verify" },
      ],
    });
    const dag = payload("workflow_dag_mcp_display");
    expect(parseMcpName(dag)).toEqual({ server: "crossagents", tool: "run_workflow" });
    expect(isWorkflowTool(dag)).toBe(false);
    expect(isDelegatedAgentTool(dag)).toBe(false);
    expect(isCrossagentSpawnAgentTool(dag)).toBe(false);
    expect(categorizeItem(taxonomyItem("workflow_dag_mcp_display"))).toBe("mcp");
  });
});
