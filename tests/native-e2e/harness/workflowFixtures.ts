import { workflowRunSchema } from "../../../src/shared/contracts/workflowTranscript.ts";
import { runtimeEventSchema } from "../../../src/shared/contracts/runtimeEvent.ts";
import { LabHttpError } from "./labAuth.ts";
import { FIXTURE_THREAD_ID } from "./labFixtures.ts";
import {
  canonicalWorkflowPayload,
  rejectedWorkflowPayload,
} from "../../../src/supervisor/agents/claude/workflowRegistration.testFixtures.ts";
import { runtimeItemPresentationSnapshot } from "../../../src/shared/runtimeItemPresentationSnapshot.ts";

export const WORKFLOW_FIXTURE_RUN_ID = "wf-native-fixture";
export const WORKFLOW_FIXTURE_REFERENCE = {
  runId: WORKFLOW_FIXTURE_RUN_ID,
  name: "Workspace verification",
  summary: "Verify the workspace in the background",
  transcriptDir: `/Users/fixture/session/subagents/workflows/${WORKFLOW_FIXTURE_RUN_ID}`,
};
export const WORKFLOW_FIXTURE_MANIFEST = `/Users/fixture/session/workflows/${WORKFLOW_FIXTURE_RUN_ID}.json`;
const WORKFLOW_FIXTURE_FINDINGS = {
  findings: [
    {
      title: "Layout",
      summary: "Retain every pane and the draft.",
      severity: "high",
      checks: 0,
      confirmed: false,
    },
    {
      title: "Keyboard",
      summary: "Move the composer above the keyboard.",
      evidence: ["portrait", "landscape"],
    },
  ],
};
const LONG_FINDING_TITLE =
  "Keep the complete workflow finding title readable when the chat becomes narrow, text grows for accessibility, and the user rotates between portrait and landscape";
const WORKFLOW_REJECTION =
  "Workflow script validation failed. Keep the complete rejection reason available.";
function workflowFindings(stress: boolean) {
  return stress
    ? {
        findings: WORKFLOW_FIXTURE_FINDINGS.findings.map((row, index) =>
          index === 0 ? { ...row, title: LONG_FINDING_TITLE } : row,
        ),
      }
    : WORKFLOW_FIXTURE_FINDINGS;
}

export function workflowLaunchItems(
  thread: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  stressResults = false,
) {
  thread.status = "finished";
  thread.attention = "none";
  thread.lastTurnStartedAt = new Date(Date.now() - 10_000).toISOString();
  delete thread.activeTurnStartedAt;
  return [
    ...items.filter(
      (item) => !["workflow-fixture-launch", "workflow-fixture-rejected"].includes(String(item.id)),
    ),
    {
      id: "workflow-fixture-launch",
      type: "tool_call",
      state: "completed",
      payload: {
        ...canonicalWorkflowPayload(WORKFLOW_FIXTURE_REFERENCE),
        result: workflowFindings(stressResults),
      },
      streams: {},
    },
    ...(stressResults
      ? [
          {
            id: "workflow-fixture-rejected",
            type: "tool_call",
            state: "completed",
            payload: rejectedWorkflowPayload(WORKFLOW_FIXTURE_REFERENCE, WORKFLOW_REJECTION),
            streams: {},
          },
        ]
      : []),
  ];
}

function workflowLaunchItem(items: Array<Record<string, unknown>>) {
  const item = items.find((row) => row.id === "workflow-fixture-launch");
  if (!item)
    throw new LabHttpError("workflow_not_prepared", "Prepare the workflow fixture first.", 409);
  return item;
}

export function markWorkflowAwaitingReference(items: Array<Record<string, unknown>>): void {
  const item = workflowLaunchItem(items);
  item.state = "started";
  item.payload = {
    ...(item.payload as Record<string, unknown>),
    status: "running",
    workflow: {
      name: WORKFLOW_FIXTURE_REFERENCE.name,
      summary: WORKFLOW_FIXTURE_REFERENCE.summary,
    },
  };
}

export function completeWorkflowLaunchReference(
  items: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const item = workflowLaunchItem(items);
  item.state = "completed";
  item.payload = {
    ...(item.payload as Record<string, unknown>),
    status: "success",
    workflow: WORKFLOW_FIXTURE_REFERENCE,
  };
  return {
    type: "item.completed",
    threadId: FIXTURE_THREAD_ID,
    itemId: item.id,
    payload: item.payload,
  };
}

export class WorkflowFixture {
  enabled = false;
  private startedAt = 0;
  private status: "running" | "completed" | "failed" = "running";
  private viewer = false;
  private resultStress = false;

  reset(): void {
    this.enabled = false;
    this.startedAt = 0;
    this.status = "running";
    this.viewer = false;
    this.resultStress = false;
  }
  prepare(): void {
    this.enabled = true;
    this.startedAt = Date.now();
    this.status = "running";
    this.viewer = false;
    this.resultStress = false;
  }
  prepareViewer(): void {
    this.prepare();
    this.viewer = true;
  }
  prepareResultStress(): void {
    this.prepareViewer();
    this.resultStress = true;
  }
  complete(failed = false): void {
    this.status = failed ? "failed" : "completed";
  }

  read(payload: Record<string, unknown>): unknown {
    if (
      payload.manifestPath !== WORKFLOW_FIXTURE_MANIFEST ||
      payload.transcriptDir !== WORKFLOW_FIXTURE_REFERENCE.transcriptDir
    ) {
      throw new LabHttpError(
        "wrong_workflow_reference",
        "The read must target the canonical workflow reference.",
        400,
      );
    }
    const run = workflowRunSchema.parse({
      runId: WORKFLOW_FIXTURE_RUN_ID,
      status: this.status,
      workflowName: WORKFLOW_FIXTURE_REFERENCE.name,
      summary: WORKFLOW_FIXTURE_REFERENCE.summary,
      startTime: this.startedAt,
      agentCount: this.viewer ? 2 : 1,
      totalTokens: this.viewer ? 1200 : undefined,
      totalToolCalls: this.status === "running" ? 3 : 7,
      phases: [
        ...(this.viewer
          ? [
              {
                title: "Inspect",
                agents: [
                  {
                    agentId: "inspect-1",
                    label: "Inspect:source",
                    state: "done",
                    tokens: 240,
                    toolCalls: 2,
                    promptPreview: "Inspect the source",
                    resultPreview: "Source reviewed",
                  },
                ],
              },
            ]
          : []),
        {
          title: "Verify",
          agents: [
            {
              agentId: "verify-1",
              label: "Verify the workspace",
              state: this.status === "completed" ? "done" : this.status,
              startedAt: this.startedAt,
              lastProgressAt: Date.now(),
              ...(this.viewer
                ? {
                    tokens: 960,
                    model: "Fixture Pro",
                    toolCalls: 3,
                    promptPreview: "Run workspace checks",
                    resultPreview: this.status === "completed" ? "No regressions" : undefined,
                  }
                : {}),
            },
          ],
        },
      ],
      unphasedAgents: [],
    });
    return { run, mtimeMs: Date.now() };
  }

  readAgent(payload: Record<string, unknown>): unknown {
    const agent = payload.agentId;
    if (
      payload.transcriptDir !== WORKFLOW_FIXTURE_REFERENCE.transcriptDir ||
      !["inspect-1", "verify-1"].includes(String(agent))
    ) {
      throw new LabHttpError(
        "wrong_workflow_agent",
        "The selected workflow agent is required.",
        400,
      );
    }
    const threadId = String(payload.threadId),
      finished = agent === "inspect-1" || this.status !== "running";
    const text =
      agent === "inspect-1"
        ? "Inspect agent full transcript"
        : finished
          ? "Verify agent completed"
          : "Verify agent is checking the workspace";
    const events = [
      { type: "turn.started", threadId, turnId: "agent-turn" },
      {
        type: "item.started",
        threadId,
        itemId: "agent-prompt",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Review the complete workspace" }] },
      },
      { type: "item.completed", threadId, itemId: "agent-prompt" },
      {
        type: "item.started",
        threadId,
        itemId: "agent-command",
        itemType: "command_execution",
        payload: { command: "sed -n '5,12p' src/App.tsx", cwd: "/workspace", status: "running" },
      },
      {
        type: "content.delta",
        threadId,
        itemId: "agent-command",
        stream: "command_output",
        delta: "Workspace checks passed\n",
      },
      {
        type: "item.completed",
        threadId,
        itemId: "agent-command",
        payload: { status: "success", exitCode: 0 },
      },
      {
        type: "item.started",
        threadId,
        itemId: "agent-mcp",
        itemType: "mcp_tool_call",
        payload: {
          name: "search",
          serverId: "workspace_docs",
          status: "success",
          args: { query: "layout" },
          result: "Full MCP result",
        },
      },
      { type: "item.completed", threadId, itemId: "agent-mcp" },
      {
        type: "item.started",
        threadId,
        itemId: "agent-results",
        itemType: "tool_call",
        payload: {
          ...canonicalWorkflowPayload(WORKFLOW_FIXTURE_REFERENCE),
          result: workflowFindings(this.resultStress),
        },
      },
      { type: "item.completed", threadId, itemId: "agent-results" },
      ...(this.resultStress
        ? [
            {
              type: "item.started",
              threadId,
              itemId: "agent-rejected",
              itemType: "tool_call",
              payload: rejectedWorkflowPayload(WORKFLOW_FIXTURE_REFERENCE, WORKFLOW_REJECTION),
            },
            { type: "item.completed", threadId, itemId: "agent-rejected" },
          ]
        : []),
      {
        type: "item.started",
        threadId,
        itemId: "agent-reply",
        itemType: "assistant_message",
        payload: {},
      },
      {
        type: "content.delta",
        threadId,
        itemId: "agent-reply",
        stream: "assistant_text",
        delta: text,
      },
      ...(finished
        ? [
            { type: "item.completed", threadId, itemId: "agent-reply" },
            { type: "turn.completed", threadId, turnId: "agent-turn", state: "completed" },
          ]
        : []),
    ];
    const canonical = runtimeEventSchema.array().parse(events);
    const itemPresentations = runtimeItemPresentationSnapshot(canonical, threadId);
    return { events: canonical, ...(itemPresentations ? { itemPresentations } : {}) };
  }
}
