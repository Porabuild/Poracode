import { describe, expect, it } from "vitest";
import type { ToolCallPayload } from "@/shared/contracts";
import { parseWorkflowInfo } from "./workflowDisplay";

function makePayload(overrides: Partial<ToolCallPayload>): ToolCallPayload {
  return { name: "Workflow", status: "success", ...overrides };
}

const SCRIPT = `export const meta = {
  name: 'test-todo-app',
  description: 'Test the vanilla-JS todo app: review across dimensions',
  phases: [
    { title: 'Review', detail: 'one agent per test dimension' },
    { title: 'Verify', detail: 'adversarially confirm each finding is real' },
    { title: 'Synthesize', detail: 'merge into a single test report' },
  ],
}

const FINDINGS_SCHEMA = {
  properties: { detail: { type: 'string', description: 'trigger + observed vs expected' } },
}
`;

const RESULT = `Workflow launched in background. Task ID: wiaaqsf20
Summary: Test the vanilla-JS todo app: review across dimensions
Transcript dir: /home/x/.claude/projects/p/sess/subagents/workflows/wf_5478fde3-ae0
Run ID: wf_5478fde3-ae0
Use /workflows to watch live progress.`;

describe("parseWorkflowInfo", () => {
  it("prefers progress.description for the description", () => {
    const info = parseWorkflowInfo(
      makePayload({
        args: { script: SCRIPT },
        progress: { description: "Live description" },
      }),
    );
    expect(info.description).toBe("Live description");
  });

  it("falls back to the result Summary line", () => {
    const info = parseWorkflowInfo(makePayload({ result: RESULT }));
    expect(info.description).toBe("Test the vanilla-JS todo app: review across dimensions");
    expect(info.runId).toBe("wf_5478fde3-ae0");
  });

  it("falls back to meta.description parsed from the script", () => {
    const info = parseWorkflowInfo(makePayload({ args: { script: SCRIPT } }));
    expect(info.description).toBe("Test the vanilla-JS todo app: review across dimensions");
  });

  it("parses the planned phases from the script meta", () => {
    const info = parseWorkflowInfo(makePayload({ args: { script: SCRIPT } }));
    expect(info.phases).toEqual([
      { title: "Review", detail: "one agent per test dimension" },
      { title: "Verify", detail: "adversarially confirm each finding is real" },
      { title: "Synthesize", detail: "merge into a single test report" },
    ]);
  });

  it("returns empty phases when no script is present", () => {
    const info = parseWorkflowInfo(makePayload({ args: { description: "Run checklist" } }));
    expect(info.phases).toEqual([]);
    expect(info.description).toBe("Run checklist");
  });

  it("derives manifestPath from the transcript dir and runId in the result", () => {
    const info = parseWorkflowInfo(makePayload({ result: RESULT }));
    expect(info.transcriptDir).toBe(
      "/home/x/.claude/projects/p/sess/subagents/workflows/wf_5478fde3-ae0",
    );
    expect(info.manifestPath).toBe(
      "/home/x/.claude/projects/p/sess/workflows/wf_5478fde3-ae0.json",
    );
  });

  it("supports Windows-style transcript paths", () => {
    const info = parseWorkflowInfo(
      makePayload({
        result:
          "Transcript dir: C:\\Users\\me\\.claude\\projects\\p\\sess\\subagents\\workflows\\wf_X\nRun ID: wf_X",
      }),
    );
    expect(info.manifestPath).toBe(
      "C:\\Users\\me\\.claude\\projects\\p\\sess\\workflows\\wf_X.json",
    );
  });
});
