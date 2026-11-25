import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk/unstable";
import type { ProjectLocation, RuntimeEvent, ThreadServerRequestId } from "@/shared/contracts";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
} from "@/supervisor/agents/acp/canonicalMapping";
import { AcpSessionRequests } from "@/supervisor/agents/acp/sessionRequests";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "@/supervisor/agents/acp/canonicalMapping/subagents";
import { PORACODE_ACP_COMMAND_STATUS_META_KEY } from "@/supervisor/agents/acp/canonicalMapping/commandStatus";
import { createAntigravityAcpExtension } from "./acpExtension";
import { transformAntigravitySessionUpdate } from "./acp";
import { isAntigravityBackgroundWaitTranscript } from "./acpTurnHold";
import {
  AntigravitySubagentBridge,
  transformAntigravitySubagentSessionUpdate,
  type AntigravitySubagentBridgeOptions,
} from "./acpSubagents";

function createTestMapper(threadId = "t-agy") {
  const state = createAcpMapperState(threadId, createAntigravityAcpExtension());
  const events: RuntimeEvent[] = [];
  const ingest = (notification: SessionNotification) => {
    const transformed = transformAntigravitySessionUpdate(notification);
    events.push(...mapAcpSessionUpdate(transformed, state));
  };
  return { state, events, ingest };
}

function writeJsonl(filePath: string, rows: unknown[]): void {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function transcriptPath(brainRoot: string, conversationId: string): string {
  return join(brainRoot, conversationId, ".system_generated", "logs", "transcript_full.jsonl");
}

interface LaunchedSubagent {
  bridge: AntigravitySubagentBridge;
  events: RuntimeEvent[];
  brainRoot: string;
  parentSessionId: string;
  childId: string;
}

/**
 * Launch one subagent through the bridge against a fixture transcript and run
 * the first poll so the conversation id is bound. Deterministic: the poll
 * interval is parked and every later poll is driven via `bridge.flush()`.
 */
async function launchSingleSubagent(
  tempRoot: string,
  options?: { turnEndSettleMs?: number },
): Promise<LaunchedSubagent> {
  const brainRoot = join(tempRoot, "brain");
  const parentSessionId = "parent-session";
  const childId = "child-conversation";
  writeJsonl(transcriptPath(brainRoot, parentSessionId), [
    {
      step_index: 1,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      created_at: new Date().toISOString(),
      tool_calls: [
        {
          name: "invoke_subagent",
          args: {
            Subagents: [{ Role: "Scout", TypeName: "research", Prompt: "Look around." }],
            toolSummary: "Run scout subagent",
          },
        },
      ],
    },
    {
      step_index: 2,
      type: "INVOKE_SUBAGENT",
      status: "DONE",
      content: `Created the following subagents:\n{"conversationId":"${childId}"}`,
    },
  ]);

  const location: ProjectLocation = { kind: "windows", path: tempRoot };
  const { events, ingest } = createTestMapper();
  const bridge = new AntigravitySubagentBridge(ingest, location, {
    brainRootPath: brainRoot,
    pollIntervalMs: 60_000,
    resolveRetryMs: 5,
    maxResolveRetries: 2,
    ...(options?.turnEndSettleMs !== undefined ? { turnEndSettleMs: options.turnEndSettleMs } : {}),
  });

  const intercepted = bridge.onSessionUpdate({
    sessionId: parentSessionId,
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "call_scout",
      title: "Run scout subagent",
      kind: "other",
      status: "in_progress",
      rawInput: {},
    },
  });
  expect(intercepted).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await bridge.flush();
  return { bridge, events, brainRoot, parentSessionId, childId };
}

describe("transformAntigravitySubagentSessionUpdate", () => {
  it("normalizes browser_subagent tool_call into a canonical browser subagent item", () => {
    const notification: SessionNotification = {
      sessionId: "sess-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_browser_1",
        title: "Verify login page",
        kind: "other",
        status: "in_progress",
        rawInput: {
          Task: "Open http://localhost:3000 and verify the login button renders.",
          TaskName: "Verify login page",
          RecordingName: "verify_login",
        },
      },
    };

    const transformed = transformAntigravitySubagentSessionUpdate(notification);
    expect(transformed.update).toMatchObject({
      sessionUpdate: "tool_call",
      rawInput: {
        _toolName: "task",
        subagent_type: "browser",
        name: "Verify login page",
        description: "Verify login page",
        prompt: "Open http://localhost:3000 and verify the login button renders.",
      },
    });

    const { ingest, events: mappedEvents } = createTestMapper();
    ingest(notification);
    expect(mappedEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "tool_call",
        payload: expect.objectContaining({
          isSubAgent: true,
          title: "Verify login page",
          status: "running",
        }),
      }),
    );
  });
});

describe("AntigravitySubagentBridge", () => {
  it("fans out multi-subagent invoke_subagent launches, streams child tool calls & tokens, and completes with reports", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-subagents-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "38b8ee25-9557-43fb-9d5c-c6da78739eb8";
      const child1Id = "b8e7c73b3fe2dc76356a952806838a19";
      const child2Id = "84157be750371d1bac224fb1d5f9c745";

      const parentTranscript = join(
        brainRoot,
        parentSessionId,
        ".system_generated",
        "logs",
        "transcript_full.jsonl",
      );
      writeJsonl(parentTranscript, [
        {
          step_index: 29,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          tool_calls: [
            {
              name: "invoke_subagent",
              args: {
                Subagents: [
                  {
                    Model: "inherit",
                    Prompt: "Review correctness and security (R1/R2).",
                    Role: "Reviewer 1 (R1 Correctness & R2 Trust)",
                    TypeName: "research",
                  },
                  {
                    Model: "gemini-4-argon",
                    Prompt: "Review UX and simplification (R3/R4).",
                    Role: "Reviewer 2 (R3 UX & R4 Reuse)",
                    TypeName: "research",
                  },
                ],
                toolAction: "Running deep-review subagents (Reviewer 1 and Reviewer 2)",
                toolSummary: "Run deep-review subagents",
              },
            },
          ],
        },
        {
          step_index: 30,
          type: "INVOKE_SUBAGENT",
          status: "DONE",
          content: [
            "Created At: 2026-10-17T20:13:52+02:00",
            "Completed At: 2026-10-17T20:13:52+02:00",
            "Created the following subagents:",
            JSON.stringify(
              {
                conversationId: child1Id,
                logAbsoluteUri: `file:///${join(brainRoot, child1Id, ".system_generated", "logs", "transcript.jsonl").replace(/\\/g, "/")}`,
                workspaceUris: [],
              },
              null,
              2,
            ),
            JSON.stringify(
              {
                conversationId: child2Id,
                logAbsoluteUri: `file:///${join(brainRoot, child2Id, ".system_generated", "logs", "transcript.jsonl").replace(/\\/g, "/")}`,
                workspaceUris: [],
              },
              null,
              2,
            ),
          ].join("\n"),
        },
      ]);

      const child1Transcript = join(
        brainRoot,
        child1Id,
        ".system_generated",
        "logs",
        "transcript_full.jsonl",
      );
      // Simulate localharness writing AGENCY_TOOL_CALL step 2 before PLANNER_RESPONSE step 1
      writeJsonl(child1Transcript, [
        {
          step_index: 2,
          type: "AGENCY_TOOL_CALL",
          status: "DONE",
          content:
            '{"tool":"client_view_file","parameters":{"absolute_path":"E:/repo/src/index.ts"}}',
        },
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          thinking: "Let me inspect src/index.ts first.",
          input_tokens: 7900,
          cache_read_tokens: 1000,
          output_tokens: 250,
          tool_calls: [
            {
              name: "client_view_file",
              args: {
                absolute_path: "E:/repo/src/index.ts",
                toolAction: "Reading src/index.ts",
                toolSummary: "Read src/index.ts",
              },
            },
          ],
        },
      ]);

      const child2Transcript = join(
        brainRoot,
        child2Id,
        ".system_generated",
        "logs",
        "transcript_full.jsonl",
      );
      writeJsonl(child2Transcript, [
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          input_tokens: 8000,
          cache_read_tokens: 0,
          output_tokens: 300,
          tool_calls: [
            {
              name: "run_command",
              args: {
                CommandLine: "git diff --stat",
                Cwd: "E:/repo",
                toolAction: "Checking git diff stat",
                toolSummary: "Run git diff",
              },
            },
          ],
        },
        {
          step_index: 3,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          input_tokens: 8500,
          cache_read_tokens: 4000,
          output_tokens: 420,
          tool_calls: [
            {
              name: "send_message",
              args: {
                Message: "### Reviewer 2 Report\nNo UX or simplification issues found.",
                Recipient: parentSessionId,
              },
            },
          ],
        },
        {
          step_index: 4,
          type: "GENERIC",
          status: "DONE",
          content: `Created At: 2026-10-17T20:17:18+02:00\nMessage sent to "${parentSessionId}".\n`,
        },
      ]);

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-subagents");
      const bridge = new AntigravitySubagentBridge(
        (notification) => ingest(notification),
        location,
        {
          brainRootPath: brainRoot,
          pollIntervalMs: 5000,
          resolveRetryMs: 10,
          maxResolveRetries: 2,
        },
      );

      const invokeNotification: SessionNotification = {
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_2",
          title: "Run deep-review subagents",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      };

      const intercepted = bridge.onSessionUpdate(invokeNotification);
      expect(intercepted).toBe(true);

      // Wait for async candidate resolution and initial poll
      await new Promise((resolve) => setTimeout(resolve, 60));
      await bridge.flush();

      // Both subagents should be started as detached subagent tool_call items
      const reviewer1Start = events.find(
        (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
          event.type === "item.started" &&
          event.itemType === "tool_call" &&
          (event.payload as { title?: string }).title === "Reviewer 1 (R1 Correctness & R2 Trust)",
      );
      expect(reviewer1Start).toMatchObject({
        type: "item.started",
        itemType: "tool_call",
        payload: {
          isSubAgent: true,
          title: "Reviewer 1 (R1 Correctness & R2 Trust)",
          status: "running",
          args: {
            _toolName: "task",
            subagent_type: "research",
            description: "Reviewer 1 (R1 Correctness & R2 Trust)",
            prompt: "Review correctness and security (R1/R2).",
            background: true,
          },
        },
      });

      const reviewer2Start = events.find(
        (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
          event.type === "item.started" &&
          event.itemType === "tool_call" &&
          (event.payload as { title?: string }).title === "Reviewer 2 (R3 UX & R4 Reuse)",
      );
      expect(reviewer2Start).toMatchObject({
        type: "item.started",
        itemType: "tool_call",
        payload: {
          isSubAgent: true,
          title: "Reviewer 2 (R3 UX & R4 Reuse)",
          status: "running",
          args: {
            _toolName: "task",
            subagent_type: "research",
            description: "Reviewer 2 (R3 UX & R4 Reuse)",
            model: "gemini-4-argon",
            background: true,
          },
        },
      });

      // Child 1's read tool call and progress update should be emitted
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "tool_call",
          parentItemId: reviewer1Start!.itemId,
          payload: expect.objectContaining({
            kind: "read",
            title: "Read src/index.ts",
          }),
        }),
      );

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: reviewer1Start!.itemId,
          payload: expect.objectContaining({
            isSubAgent: true,
            status: "running",
            progress: expect.objectContaining({
              lastToolName: "client_view_file",
              description: "Reading src/index.ts",
              stepCount: 1,
              tokens: 9150,
            }),
          }),
        }),
      );

      // Child 2 already called send_message + GENERIC "Message sent to ...", so it should be completed
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          itemId: reviewer2Start!.itemId,
          payload: expect.objectContaining({
            isSubAgent: true,
            status: "success",
            subAgentStatus: "completed",
            result: "### Reviewer 2 Report\nNo UX or simplification issues found.",
            progress: expect.objectContaining({
              stepCount: 1,
              tokens: 12920,
              model: "gemini-4-argon",
            }),
          }),
        }),
      );

      // Now complete Child 1 via parent SYSTEM_MESSAGE
      writeJsonl(parentTranscript, [
        {
          step_index: 29,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          tool_calls: [
            {
              name: "invoke_subagent",
              args: {
                Subagents: [
                  {
                    Model: "inherit",
                    Prompt: "Review correctness and security (R1/R2).",
                    Role: "Reviewer 1 (R1 Correctness & R2 Trust)",
                    TypeName: "research",
                  },
                  {
                    Model: "gemini-4-argon",
                    Prompt: "Review UX and simplification (R3/R4).",
                    Role: "Reviewer 2 (R3 UX & R4 Reuse)",
                    TypeName: "research",
                  },
                ],
                toolSummary: "Run deep-review subagents",
              },
            },
          ],
        },
        {
          step_index: 30,
          type: "INVOKE_SUBAGENT",
          status: "DONE",
          content: `Created the following subagents:\n{"conversationId":"${child1Id}"}\n{"conversationId":"${child2Id}"}`,
        },
        {
          step_index: 38,
          type: "SYSTEM_MESSAGE",
          status: "DONE",
          content: `The following is a <SYSTEM_MESSAGE> not actually sent by the user.\n\n<SYSTEM_MESSAGE>\n[Message] timestamp=2026-10-17T18:26:06Z sender=${child1Id} priority=MESSAGE_PRIORITY_HIGH content=### Reviewer 1 Report\nAll R1 and R2 invariants hold.\n</SYSTEM_MESSAGE>`,
        },
      ]);

      await bridge.flush();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          itemId: reviewer1Start!.itemId,
          payload: expect.objectContaining({
            isSubAgent: true,
            status: "success",
            result: "### Reviewer 1 Report\nAll R1 and R2 invariants hold.",
          }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("re-ingests non-subagent generic tool calls and settles them on subsequent model output", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-generic-tool-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-generic");
      const bridge = new AntigravitySubagentBridge(
        (notification) => ingest(notification),
        location,
        {
          brainRootPath: brainRoot,
          resolveRetryMs: 5,
          maxResolveRetries: 1,
        },
      );

      const mcpCall: SessionNotification = {
        sessionId: "sess-no-brain-dir",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_mcp_1",
          title: "Check PR #928 status",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      };

      expect(bridge.onSessionUpdate(mcpCall)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "tool_call",
          payload: expect.objectContaining({
            title: "Check PR #928 status",
            status: "running",
          }),
        }),
      );

      // Subsequent model output settles the generic tool call via acpReadCompletion
      ingest({
        sessionId: "sess-no-brain-dir",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "PR #928 checks passed." },
        },
      });

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          payload: expect.objectContaining({
            title: "Check PR #928 status",
            status: "success",
          }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("renders a plain top-level row when no planner call title matches", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-title-mismatch-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "sess-mismatch";
      writeJsonl(transcriptPath(brainRoot, parentSessionId), [
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          tool_calls: [
            {
              name: "invoke_subagent",
              args: {
                Subagents: [{ Role: "Scout", TypeName: "research", Prompt: "Look around." }],
                toolSummary: "Run scout subagent",
              },
            },
          ],
        },
      ]);

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-mismatch");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 5,
        maxResolveRetries: 1,
      });

      const intercepted = bridge.onSessionUpdate({
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_unrelated",
          title: "Unrelated MCP call",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      });
      expect(intercepted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 30));

      // No title-identical planner call: the notification must render as the
      // plain row it is, never as subagent cards bound positionally.
      expect(
        events.filter(
          (event) =>
            event.type === "item.started" &&
            (event.payload as { isSubAgent?: boolean }).isSubAgent === true,
        ),
      ).toHaveLength(0);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "tool_call",
          payload: expect.objectContaining({ title: "Unrelated MCP call", status: "running" }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores planner calls left over from an earlier run of a resumed session", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-stale-match-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "sess-stale";
      writeJsonl(transcriptPath(brainRoot, parentSessionId), [
        {
          step_index: 7,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tool_calls: [
            {
              name: "invoke_subagent",
              args: {
                Subagents: [{ Role: "Scout", TypeName: "research", Prompt: "Look around." }],
                toolSummary: "Run scout subagent",
              },
            },
          ],
        },
      ]);

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-stale");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 5,
        maxResolveRetries: 1,
      });

      const intercepted = bridge.onSessionUpdate({
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_fresh",
          title: "Run scout subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      });
      expect(intercepted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Same title, but the transcript call is hours old (session resumed):
      // binding it would fan out cards for a long-finished invocation.
      expect(
        events.filter(
          (event) =>
            event.type === "item.started" &&
            (event.payload as { isSubAgent?: boolean }).isSubAgent === true,
        ),
      ).toHaveLength(0);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          payload: expect.objectContaining({ title: "Run scout subagent", status: "running" }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not intercept notifications while session history is replaying", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-replay-guard-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "sess-replay";
      writeJsonl(transcriptPath(brainRoot, parentSessionId), [
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          tool_calls: [
            {
              name: "invoke_subagent",
              args: {
                Subagents: [{ Role: "Scout", TypeName: "research", Prompt: "Look around." }],
                toolSummary: "Run scout subagent",
              },
            },
          ],
        },
      ]);

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-replay");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        resolveRetryMs: 5,
        maxResolveRetries: 1,
        isReplayingHistory: () => true,
      });

      const intercepted = bridge.onSessionUpdate({
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_replayed",
          title: "Run scout subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      });
      expect(intercepted).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(events).toHaveLength(0);

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("settles running cards when the turn is cancelled", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-turn-cancel-"));
    try {
      const { bridge, events } = await launchSingleSubagent(tempRoot);

      bridge.onTurnEnd("cancelled");

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          payload: expect.objectContaining({
            isSubAgent: true,
            subAgentStatus: "cancelled",
          }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps cards open after end_turn and completes them when late reports land", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-late-report-"));
    try {
      const { bridge, events, brainRoot, parentSessionId, childId } =
        await launchSingleSubagent(tempRoot);

      bridge.onTurnEnd("completed");
      // The card must stay open: reports genuinely arrive after end_turn.
      expect(events.filter((event) => event.type === "item.completed")).toHaveLength(0);

      writeJsonl(transcriptPath(brainRoot, childId), [
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          tool_calls: [
            {
              name: "send_message",
              args: { Message: "Scout report: all clear.", Recipient: parentSessionId },
            },
          ],
        },
        {
          step_index: 2,
          type: "GENERIC",
          status: "DONE",
          content: `Message sent to "${parentSessionId}".`,
        },
      ]);
      await bridge.flush();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          payload: expect.objectContaining({
            isSubAgent: true,
            subAgentStatus: "completed",
            result: "Scout report: all clear.",
          }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("settles cards as failed when transcripts stay quiet after the turn ended", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-turn-quiet-"));
    try {
      const { bridge, events } = await launchSingleSubagent(tempRoot, { turnEndSettleMs: 30 });

      bridge.onTurnEnd("completed");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await bridge.flush();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          payload: expect.objectContaining({
            isSubAgent: true,
            subAgentStatus: "failed",
          }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps a pending parent read open while child subagent activity streams by", () => {
    const { events, ingest } = createTestMapper("t-read-gate");
    ingest({
      sessionId: "sess-read",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "read_1",
        title: "Read src/index.ts",
        kind: "read",
        status: "in_progress",
        rawInput: { absolute_path: "E:/repo/src/index.ts" },
      },
    });

    // Child thought ingested by the bridge carries parenting meta.
    ingest({
      sessionId: "sess-read",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "child reasoning" },
        _meta: {
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "call_scout",
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "call_scout",
        },
      },
    });
    expect(events.filter((event) => event.type === "item.completed")).toHaveLength(0);

    // Parent model output still settles the read.
    ingest({
      sessionId: "sess-read",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "parent reasoning" },
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ status: "success" }),
      }),
    );
  });

  it("re-ingests the original tool call when the mapper throws during resolution", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-resolve-fail-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const brainRoot = join(tempRoot, "brain");
      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-resolve-fail");
      let failOnce = true;
      const bridge = new AntigravitySubagentBridge(
        (notification) => {
          if (failOnce) {
            failOnce = false;
            throw new Error("mapper boom");
          }
          ingest(notification);
        },
        location,
        { brainRootPath: brainRoot, resolveRetryMs: 5, maxResolveRetries: 1 },
      );

      const notification: SessionNotification = {
        sessionId: "sess-fail",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_fail",
          title: "Mystery tool",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      };
      expect(bridge.onSessionUpdate(notification)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 30));

      // The first ingest threw; the fail-open path must still render the row.
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "tool_call",
          payload: expect.objectContaining({ title: "Mystery tool", status: "running" }),
        }),
      );
      expect(warn).toHaveBeenCalled();

      bridge.dispose();
    } finally {
      warn.mockRestore();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("skips malformed transcript lines and still resolves the launch", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-malformed-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "sess-malformed";
      const childId = "child-malformed";
      const transcript = transcriptPath(brainRoot, parentSessionId);
      mkdirSync(join(transcript, ".."), { recursive: true });
      writeFileSync(
        transcript,
        `${[
          "this is not json at all",
          JSON.stringify({
            step_index: 1,
            type: "PLANNER_RESPONSE",
            status: "DONE",
            tool_calls: [
              {
                name: "invoke_subagent",
                args: {
                  Subagents: [{ Role: "Scout", TypeName: "research", Prompt: "Look." }],
                  toolSummary: "Run scout subagent",
                },
              },
            ],
          }),
          '{"step_index": 2, "type": "PLANNER_RESP',
          JSON.stringify({
            step_index: 3,
            type: "INVOKE_SUBAGENT",
            status: "DONE",
            content: `Created the following subagents:\n{"conversationId":"${childId}"}`,
          }),
        ].join("\n")}\n`,
        "utf8",
      );

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-malformed");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 5,
        maxResolveRetries: 2,
      });

      const intercepted = bridge.onSessionUpdate({
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_scout",
          title: "Run scout subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      });
      expect(intercepted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 30));
      await bridge.flush();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "tool_call",
          payload: expect.objectContaining({ title: "Scout", isSubAgent: true, status: "running" }),
        }),
      );

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("renders a plain row when the session brain directory has no transcript yet", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-no-transcript-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "sess-empty";
      // The directory exists (the session started) but no transcript file has
      // been flushed yet — the bridge retries, then falls back to the row.
      mkdirSync(join(brainRoot, parentSessionId), { recursive: true });

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-no-transcript");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 5,
        maxResolveRetries: 2,
      });

      const intercepted = bridge.onSessionUpdate({
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_plain",
          title: "Run scout subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      });
      expect(intercepted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          payload: expect.objectContaining({ title: "Run scout subagent", status: "running" }),
        }),
      );
      expect(
        events.filter(
          (event) =>
            event.type === "item.started" &&
            (event.payload as { isSubAgent?: boolean }).isSubAgent === true,
        ),
      ).toHaveLength(0);

      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("stops resolving without side effects when disposed mid-resolution", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-dispose-mid-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "sess-dispose";
      // Directory exists but no transcript: resolution sits in the retry loop.
      mkdirSync(join(brainRoot, parentSessionId), { recursive: true });

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-dispose");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 20,
        maxResolveRetries: 5,
      });

      const intercepted = bridge.onSessionUpdate({
        sessionId: parentSessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_disposed",
          title: "Run scout subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      });
      expect(intercepted).toBe(true);
      bridge.dispose();
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(events).toHaveLength(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps the post-turn settle bound armed when stray wire updates arrive", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-stray-update-"));
    try {
      const launched = await launchSingleSubagent(tempRoot, { turnEndSettleMs: 30 });
      const { bridge, events } = launched;
      bridge.onTurnEnd("completed");
      // Trailing wire chatter (agy emits updates after end_turn) must not
      // disarm the inactivity bound.
      bridge.onSessionUpdate({
        sessionId: launched.parentSessionId,
        update: { sessionUpdate: "available_commands_update", availableCommands: [] },
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      await bridge.flush();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.completed",
          payload: expect.objectContaining({ isSubAgent: true, subAgentStatus: "failed" }),
        }),
      );
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("settles cards that launch after the turn was cancelled mid-resolution", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-late-launch-"));
    try {
      const brainRoot = join(tempRoot, "brain");
      const parentSessionId = "parent-session";
      const childId = "child-conversation";
      const plannerStep = (stepIndex: number, child: string) => [
        {
          step_index: stepIndex,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          created_at: new Date().toISOString(),
          tool_calls: [
            {
              name: "invoke_subagent",
              args: {
                Subagents: [{ Role: "Scout", TypeName: "research", Prompt: "Look." }],
                toolSummary: "Run scout subagent",
              },
            },
          ],
        },
        {
          step_index: stepIndex + 1,
          type: "INVOKE_SUBAGENT",
          status: "DONE",
          content: `Created the following subagents:\n{"conversationId":"${child}"}`,
        },
      ];
      writeJsonl(transcriptPath(brainRoot, parentSessionId), [...plannerStep(1, childId)]);

      const location: ProjectLocation = { kind: "windows", path: tempRoot };
      const { events, ingest } = createTestMapper("t-late");
      const bridge = new AntigravitySubagentBridge(ingest, location, {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 5,
        maxResolveRetries: 2,
      });
      const notify = (toolCallId = "call_scout") =>
        bridge.onSessionUpdate({
          sessionId: parentSessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId,
            title: "Run scout subagent",
            kind: "other",
            status: "in_progress",
            rawInput: {},
          },
        });

      notify();
      // The cancel lands while the planner match is still resolving; the card
      // launches after the turn died and must settle immediately.
      bridge.onTurnEnd("cancelled");
      await new Promise((resolve) => setTimeout(resolve, 30));
      await bridge.flush();
      const cancelledCount = () =>
        events.filter(
          (event) =>
            event.type === "item.completed" &&
            (event.payload as Record<string, unknown> | undefined)?.subAgentStatus === "cancelled",
        ).length;
      expect(cancelledCount()).toBe(1);

      // A fresh prompt turn re-arms the latch: the next launch tracks normally.
      bridge.onTurnStart();
      writeJsonl(transcriptPath(brainRoot, parentSessionId), [
        ...plannerStep(1, childId),
        ...plannerStep(3, "child-conversation-2"),
      ]);
      notify("call_scout_2");
      await new Promise((resolve) => setTimeout(resolve, 30));
      await bridge.flush();
      const subagentStarts = events.filter(
        (event) =>
          event.type === "item.started" &&
          (event.payload as Record<string, unknown> | undefined)?.isSubAgent === true,
      );
      expect(subagentStarts).toHaveLength(2);
      expect(cancelledCount()).toBe(1);
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("agy_acp_server 1.5.x wire", () => {
  const WIRE_PARENT_SESSION = "parent-1";
  const WIRE_LAUNCH_ID = "parent-1:1";
  const WIRE_CHILD_ID = "child-1";
  const WIRE_LAUNCH_TITLE = "Running invoke_subagent";

  function parentSteps(): unknown[] {
    return [
      { step_index: 0, type: "USER_INPUT", status: "DONE", content: "run pwd via a subagent" },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: new Date().toISOString(),
        tool_calls: [
          {
            name: "invoke_subagent",
            args: {
              Subagents: [
                { Role: "Command Runner", TypeName: "self", Prompt: "Run pwd", Model: "inherit" },
              ],
              toolAction: "Launching subagent",
              toolSummary: "Launch subagent to run pwd",
            },
          },
        ],
      },
      {
        step_index: 2,
        type: "INVOKE_SUBAGENT",
        status: "DONE",
        content: `Created the following subagents:\n{"conversationId":"${WIRE_CHILD_ID}"}`,
      },
      { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", content: "waiting" },
    ];
  }

  function parentRunCommandStep(
    command: string,
    cwd: string,
    createdAt = new Date().toISOString(),
  ): unknown {
    return {
      step_index: 5,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      created_at: createdAt,
      tool_calls: [{ name: "run_command", args: { CommandLine: command, Cwd: cwd } }],
    };
  }

  function childSteps(): unknown[] {
    return [
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        tool_calls: [
          {
            name: "run_command",
            args: { CommandLine: "pwd", Cwd: "/w", toolAction: "Running pwd" },
          },
        ],
      },
    ];
  }

  function childRunCommandSteps(options?: {
    command?: string;
    cwd?: string;
    exitCode?: number;
    createdAt?: string;
    executionCreatedAt?: string;
    withExecution?: boolean;
    stepIndex?: number;
    output?: string;
  }): unknown[] {
    const createdAt = options?.createdAt ?? new Date().toISOString();
    const stepIndex = options?.stepIndex ?? 1;
    return [
      {
        step_index: stepIndex,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: createdAt,
        tool_calls: [
          {
            name: "run_command",
            args: {
              CommandLine: options?.command ?? "pwd",
              Cwd: options?.cwd ?? "/w",
              toolAction: "Running pwd",
            },
          },
        ],
      },
      ...(options?.withExecution === false
        ? []
        : [
            {
              step_index: stepIndex + 1,
              type: "RUN_COMMAND",
              status: "DONE",
              exit_code: options?.exitCode ?? 0,
              created_at: options?.executionCreatedAt ?? createdAt,
              content: options?.output ?? "The command exited.",
            },
          ]),
    ];
  }

  function reportStep(): unknown {
    return {
      step_index: 4,
      type: "SYSTEM_MESSAGE",
      status: "DONE",
      content: `The following is a <SYSTEM_MESSAGE> not actually sent by the user.\n\n<SYSTEM_MESSAGE>\n[Message] timestamp=2026-11-25T10:00:00Z sender=${WIRE_CHILD_ID} priority=MESSAGE_PRIORITY_HIGH content=### Report\npwd printed /w.\n</SYSTEM_MESSAGE>`,
    };
  }

  function wireLaunchCall(title = WIRE_LAUNCH_TITLE): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: WIRE_LAUNCH_ID,
        title,
        kind: "other",
        status: "in_progress",
        rawInput: {},
      },
    };
  }

  function wireLaunchReceipt(toolCallId = WIRE_LAUNCH_ID): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "completed",
        rawOutput: "Launch subagent to run pwd",
      },
    };
  }

  function wireChildCall(toolCallId = `${WIRE_CHILD_ID}:1`): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: "pwd",
        kind: "execute",
        status: "in_progress",
        rawInput: { command_line: "pwd", working_dir: "/w" },
      },
    };
  }

  function wireChildResult(toolCallId = `${WIRE_CHILD_ID}:1`): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "completed",
        rawOutput: { exitCode: 0, combinedOutput: "/w\r\n" },
      },
    };
  }

  const WIRE_EXECUTE_ID = "943a046432de4d6db9e12f9de9fb6bb4";

  function wireExecuteStart(options?: {
    command?: string;
    cwd?: string;
    toolCallId?: string;
    status?: "pending" | "in_progress";
  }): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: options?.toolCallId ?? WIRE_EXECUTE_ID,
        title: "pwd",
        kind: "execute",
        status: options?.status ?? "pending",
        rawInput: {
          CommandLine: options?.command ?? "pwd",
          Cwd: options?.cwd ?? "/w",
          WaitMsBeforeAsync: 5000,
        },
      },
    };
  }

  function wireExecuteRunning(
    toolCallId = WIRE_EXECUTE_ID,
    command = "pwd",
    cwd = "/w",
  ): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        title: "pwd",
        kind: "execute",
        status: "in_progress",
        rawInput: { command_line: command, working_dir: cwd },
      },
    };
  }

  function wireExecuteResult(toolCallId = WIRE_EXECUTE_ID, exitCode = 0): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "completed",
        rawOutput: {
          commandLine: "pwd",
          workingDir: "/w",
          exitCode,
          exit_code: exitCode,
          combinedOutput: "/w\r\n",
          formatted_output: "/w\r\n",
        },
      },
    };
  }

  function wireExecuteFailed(toolCallId = WIRE_EXECUTE_ID): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "failed",
        rawOutput: "Rejected by user",
      },
    };
  }

  function setupWireFixture(
    tempRoot: string,
    bridgeOptions?: Partial<AntigravitySubagentBridgeOptions>,
    childStepsOverride?: unknown[],
  ) {
    const brainRoot = join(tempRoot, "brain");
    const parentTranscript = transcriptPath(brainRoot, WIRE_PARENT_SESSION);
    writeJsonl(parentTranscript, parentSteps());
    writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childStepsOverride ?? childSteps());
    const { ingest: mapIngest, events } = createTestMapper("t-wire");
    const ingested = vi.fn<(notification: SessionNotification) => void>((notification) =>
      mapIngest(notification),
    );
    const bridge = new AntigravitySubagentBridge(
      ingested,
      { kind: "windows", path: tempRoot },
      {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 0,
        maxResolveRetries: 2,
        ...bridgeOptions,
      },
    );
    return { bridge, ingested, brainRoot, parentTranscript, events };
  }

  const WIRE_CHILD_2_ID = "child-2";

  function twoChildParentSteps(): unknown[] {
    return [
      { step_index: 0, type: "USER_INPUT", status: "DONE", content: "run two commands" },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        created_at: new Date().toISOString(),
        tool_calls: [
          {
            name: "invoke_subagent",
            args: {
              Subagents: [
                { Role: "First", TypeName: "self", Prompt: "Run the first command" },
                { Role: "Second", TypeName: "self", Prompt: "Run the second command" },
              ],
              toolSummary: "Run two subagents",
            },
          },
        ],
      },
      {
        step_index: 2,
        type: "INVOKE_SUBAGENT",
        status: "DONE",
        content: `Created the following subagents:\n{"conversationId":"${WIRE_CHILD_ID}"}\n{"conversationId":"${WIRE_CHILD_2_ID}"}`,
      },
      { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", content: "waiting" },
    ];
  }

  function reportStepFor(sender: string, stepIndex = 4): unknown {
    return {
      step_index: stepIndex,
      type: "SYSTEM_MESSAGE",
      status: "DONE",
      content: `The following is a <SYSTEM_MESSAGE> not actually sent by the user.\n\n<SYSTEM_MESSAGE>\n[Message] timestamp=2026-11-25T10:00:00Z sender=${sender} priority=MESSAGE_PRIORITY_HIGH content=### Report\ndone.\n</SYSTEM_MESSAGE>`,
    };
  }

  function setupTwoChildFixture(
    tempRoot: string,
    child1Steps: unknown[],
    child2Steps: unknown[],
    bridgeOptions?: Partial<AntigravitySubagentBridgeOptions>,
  ) {
    const brainRoot = join(tempRoot, "brain");
    const parentTranscript = transcriptPath(brainRoot, WIRE_PARENT_SESSION);
    writeJsonl(parentTranscript, twoChildParentSteps());
    writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), child1Steps);
    writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_2_ID), child2Steps);
    const { ingest: mapIngest, events } = createTestMapper("t-wire-two");
    const ingested = vi.fn<(notification: SessionNotification) => void>((notification) =>
      mapIngest(notification),
    );
    const bridge = new AntigravitySubagentBridge(
      ingested,
      { kind: "windows", path: tempRoot },
      {
        brainRootPath: brainRoot,
        pollIntervalMs: 60_000,
        resolveRetryMs: 0,
        maxResolveRetries: 2,
        ...bridgeOptions,
      },
    );
    return { bridge, ingested, brainRoot, events, parentTranscript };
  }

  function twoChildLaunch(): SessionNotification {
    return {
      sessionId: WIRE_PARENT_SESSION,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: WIRE_LAUNCH_ID,
        title: WIRE_LAUNCH_TITLE,
        kind: "other",
        status: "in_progress",
        rawInput: {
          Subagents: [
            { Role: "First", TypeName: "self", Prompt: "Run the first command" },
            { Role: "Second", TypeName: "self", Prompt: "Run the second command" },
          ],
        },
      },
    };
  }

  type IngestMock = ReturnType<typeof vi.fn<(notification: SessionNotification) => void>>;

  function ingestedUpdates(ingested: IngestMock): Record<string, unknown>[] {
    return ingested.mock.calls.map((call) => call[0].update as Record<string, unknown>);
  }

  function isDetachedLaunch(update: Record<string, unknown>): boolean {
    const meta = update._meta as Record<string, unknown> | undefined;
    return meta?.[PORACODE_ACP_DETACHED_SUBAGENT_META_KEY] === true;
  }

  function detachedLaunches(ingested: IngestMock): Record<string, unknown>[] {
    return ingestedUpdates(ingested).filter(isDetachedLaunch);
  }

  async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const startedAt = Date.now();
    while (!predicate()) {
      if (Date.now() - startedAt > timeoutMs) throw new Error("timed out waiting for bridge state");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  it("launches a detached card from the Running <name> title", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-launch-"));
    try {
      const { bridge, ingested } = setupWireFixture(tempRoot);
      expect(bridge.onSessionUpdate(wireLaunchCall())).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);

      const detached = detachedLaunches(ingested);
      expect(detached).toHaveLength(1);
      expect(detached[0]).toMatchObject({ title: "Command Runner" });
      expect(ingestedUpdates(ingested).some((update) => update.title === WIRE_LAUNCH_TITLE)).toBe(
        false,
      );
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("drops the launch receipt so the card stays in progress", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-receipt-"));
    try {
      const { bridge, ingested } = setupWireFixture(tempRoot);
      expect(bridge.onSessionUpdate(wireLaunchCall())).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);

      const before = ingested.mock.calls.length;
      expect(bridge.onSessionUpdate(wireLaunchReceipt())).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(ingested.mock.calls.length).toBe(before);
      expect(
        ingestedUpdates(ingested).some(
          (update) => update.toolCallId === WIRE_LAUNCH_ID && update.status === "completed",
        ),
      ).toBe(false);
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("drops the receipt even when it arrives during launch resolution", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-race-"));
    try {
      const { bridge, ingested } = setupWireFixture(tempRoot);
      expect(bridge.onSessionUpdate(wireLaunchCall())).toBe(true);
      expect(bridge.onSessionUpdate(wireLaunchReceipt())).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const detached = detachedLaunches(ingested);
      expect(detached).toHaveLength(1);
      expect(detached[0]).toMatchObject({ title: "Command Runner" });
      expect(ingestedUpdates(ingested).some((update) => update.title === WIRE_LAUNCH_TITLE)).toBe(
        false,
      );
      expect(
        ingestedUpdates(ingested).some(
          (update) =>
            update.sessionUpdate === "tool_call_update" &&
            update.toolCallId === WIRE_LAUNCH_ID &&
            update.status === "completed",
        ),
      ).toBe(false);
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("drops the child's untagged wire tool calls", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-child-"));
    try {
      const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
      expect(bridge.onSessionUpdate(wireLaunchCall())).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);
      writeJsonl(
        transcriptPath(brainRoot, WIRE_CHILD_ID),
        childRunCommandSteps({
          createdAt: new Date(Date.now() - 60_000).toISOString(),
          stepIndex: 3,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      await bridge.flush();

      expect(bridge.onSessionUpdate(wireChildCall())).toBe(true);
      expect(bridge.onSessionUpdate(wireChildResult())).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const updates = ingestedUpdates(ingested);
      expect(updates.some((update) => update.toolCallId === `${WIRE_CHILD_ID}:1`)).toBe(false);
      expect(
        updates.some(
          (update) =>
            typeof update.toolCallId === "string" &&
            update.toolCallId.startsWith(`${WIRE_LAUNCH_ID}:step:`),
        ),
      ).toBe(true);
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("completes the card with the child's report", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-report-"));
    try {
      const { bridge, ingested, parentTranscript } = setupWireFixture(tempRoot);
      expect(bridge.onSessionUpdate(wireLaunchCall())).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);

      writeJsonl(parentTranscript, [...parentSteps(), reportStep()]);
      await bridge.flush();

      expect(
        ingestedUpdates(ingested).some(
          (update) =>
            update.sessionUpdate === "tool_call_update" &&
            update.toolCallId === WIRE_LAUNCH_ID &&
            update.status === "completed",
        ),
      ).toBe(true);
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("lets unrelated and untracked updates through", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-passthrough-"));
    try {
      const { bridge, ingested } = setupWireFixture(tempRoot);

      expect(bridge.onSessionUpdate(wireLaunchReceipt("parent-1:9"))).not.toBe(true);
      expect(bridge.onSessionUpdate(wireChildCall("unknown-child:1"))).not.toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(ingested).not.toHaveBeenCalled();
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("still matches the legacy toolSummary title", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-legacy-"));
    try {
      const { bridge, ingested } = setupWireFixture(tempRoot);
      expect(bridge.onSessionUpdate(wireLaunchCall("Launch subagent to run pwd"))).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);

      const detached = detachedLaunches(ingested);
      expect(detached).toHaveLength(1);
      expect(detached[0]).toMatchObject({ title: "Command Runner" });
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("re-reads the parent transcript on every poll once it shows the waiting shape", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agy-wire-cache-"));
    try {
      const { bridge, parentTranscript } = setupWireFixture(tempRoot, {
        parentReadMaxAgeMs: 1_000,
      });
      // `readParentTranscriptSteps` only reads a transcript for a known session.
      bridge.onSessionUpdate({
        sessionId: WIRE_PARENT_SESSION,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "The subagent has been launched to run `pwd`." },
        },
      });
      const fixed = new Date("2026-11-25T10:00:00Z");
      utimesSync(parentTranscript, fixed, fixed);
      const reads = vi.spyOn(
        bridge as unknown as { readTranscriptSteps(dir: string): Promise<unknown> },
        "readTranscriptSteps",
      );

      // A transcript that is not waiting is still served from cache.
      await bridge.readParentTranscriptSteps();
      await bridge.readParentTranscriptSteps();
      expect(reads).toHaveBeenCalledTimes(1);

      // A waiting transcript is never cached: the same pinned mtime cannot
      // keep serving it once an observation has to lead to a hold.
      writeJsonl(parentTranscript, [
        { step_index: 0, type: "USER_INPUT", status: "DONE", content: "run pwd via a subagent" },
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          status: "DONE",
          tool_calls: [{ name: "run_command", args: { CommandLine: "pwd" } }],
        },
        { step_index: 2, type: "RUN_COMMAND", status: "RUNNING", content: "started" },
        { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", content: "STARTED" },
      ]);
      utimesSync(parentTranscript, fixed, fixed);
      // Age the non-waiting cache entry out (max age is 1 s here) so the waiting file is observed.
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      const waiting = await bridge.readParentTranscriptSteps();
      expect(reads).toHaveBeenCalledTimes(2);
      expect(waiting).toBeDefined();
      expect(isAntigravityBackgroundWaitTranscript(waiting!)).toBe(true);

      // Every later poll re-reads, because a positive is never cached.
      await bridge.readParentTranscriptSteps();
      expect(reads).toHaveBeenCalledTimes(3);
      bridge.dispose();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe("approval-gated invoke_subagent launch", () => {
    function pendingLaunch(): SessionNotification {
      return {
        sessionId: WIRE_PARENT_SESSION,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: WIRE_LAUNCH_ID,
          title: "Run invoke_subagent?",
          kind: "other",
          status: "pending",
          rawInput: {
            Subagents: [
              { Model: "inherit", Prompt: "Run pwd", Role: "Command Runner", TypeName: "self" },
            ],
          },
        },
      };
    }

    function launchRunning(): SessionNotification {
      return {
        sessionId: WIRE_PARENT_SESSION,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: WIRE_LAUNCH_ID,
          title: "Running invoke_subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      };
    }

    function launchFailed(): SessionNotification {
      return {
        sessionId: WIRE_PARENT_SESSION,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: WIRE_LAUNCH_ID,
          status: "failed",
          rawOutput: "Rejected by user",
        },
      };
    }

    function autoApprovedWithSpec(): SessionNotification {
      return {
        sessionId: WIRE_PARENT_SESSION,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: WIRE_LAUNCH_ID,
          title: "Running invoke_subagent",
          kind: "other",
          status: "in_progress",
          rawInput: {
            Subagents: [
              { Model: "inherit", Prompt: "Run pwd", Role: "Command Runner", TypeName: "self" },
            ],
          },
        },
      };
    }

    it("lets the pending launch and its approval through untouched", () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-passthrough-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        expect(bridge.onSessionUpdate(pendingLaunch())).toBeUndefined();
        expect(ingested).not.toHaveBeenCalled();
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("adds the subagent cards beside the launch row once the launch is approved", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-card-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        expect(bridge.onSessionUpdate(pendingLaunch())).toBeUndefined();
        expect(bridge.onSessionUpdate(launchRunning())).toBe(true);
        await until(() =>
          ingestedUpdates(ingested).some(
            (update) => update.toolCallId === `${WIRE_LAUNCH_ID}:subagent:0`,
          ),
        );

        const detached = detachedLaunches(ingested);
        expect(detached).toHaveLength(1);
        const card = detached[0]!;
        expect(card).toMatchObject({
          toolCallId: `${WIRE_LAUNCH_ID}:subagent:0`,
          title: "Command Runner",
        });
        expect(
          (card._meta as Record<string, unknown>)[PORACODE_ACP_DETACHED_SUBAGENT_META_KEY],
        ).toBe(true);
        expect(
          ingestedUpdates(ingested).some(
            (update) => update.toolCallId === WIRE_LAUNCH_ID && update.status === "in_progress",
          ),
        ).toBe(true);
        expect(detached.some((update) => update.toolCallId === WIRE_LAUNCH_ID)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("still completes the launch row with the server's receipt", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-receipt-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        bridge.onSessionUpdate(pendingLaunch());
        expect(bridge.onSessionUpdate(launchRunning())).toBe(true);
        await until(() =>
          ingestedUpdates(ingested).some(
            (update) => update.toolCallId === `${WIRE_LAUNCH_ID}:subagent:0`,
          ),
        );
        // Let the post-card poll and resolution finish: a deferred update is
        // buffered by the bridge, not owned by it.
        await new Promise((resolve) => setTimeout(resolve, 50));

        const before = ingested.mock.calls.length;
        expect(bridge.onSessionUpdate(wireLaunchReceipt())).toBeUndefined();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(ingested.mock.calls.length).toBe(before);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("launches nothing when the pending launch is denied", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-denied-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        expect(bridge.onSessionUpdate(pendingLaunch())).toBeUndefined();
        expect(bridge.onSessionUpdate(launchFailed())).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(detachedLaunches(ingested)).toHaveLength(0);
        expect(
          ingestedUpdates(ingested).some(
            (update) => update.toolCallId === WIRE_LAUNCH_ID && update.status === "failed",
          ),
        ).toBe(true);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("drops the approved child's own wire rows", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-child-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        bridge.onSessionUpdate(pendingLaunch());
        expect(bridge.onSessionUpdate(launchRunning())).toBe(true);
        await until(() =>
          ingestedUpdates(ingested).some(
            (update) => update.toolCallId === `${WIRE_LAUNCH_ID}:subagent:0`,
          ),
        );
        await bridge.flush();

        expect(bridge.onSessionUpdate(wireChildCall())).toBe(true);
        expect(
          ingestedUpdates(ingested).some((update) => update.toolCallId === `${WIRE_CHILD_ID}:1`),
        ).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("binds a colonless child execute to the transcript plan exactly once", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-execute-"));
      try {
        const { bridge, ingested, brainRoot, events } = setupWireFixture(tempRoot);
        bridge.onSessionUpdate(pendingLaunch());
        expect(bridge.onSessionUpdate(launchRunning())).toBe(true);
        await until(() => detachedLaunches(ingested).length > 0);
        await new Promise((resolve) => setTimeout(resolve, 30));
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());

        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        expect(bridge.onSessionUpdate(wireExecuteRunning())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();

        const wireUpdates = ingestedUpdates(ingested).filter(
          (update) => update.toolCallId === WIRE_EXECUTE_ID,
        );
        expect(wireUpdates).toHaveLength(3);
        const [start, running, completed] = wireUpdates;
        expect(start?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
        });
        expect(running?.status).toBe("in_progress");
        expect(completed).toMatchObject({
          status: "completed",
          rawOutput: expect.objectContaining({ exitCode: 0, exit_code: 0 }),
        });
        expect(
          ingestedUpdates(ingested).some(
            (update) =>
              typeof update.toolCallId === "string" &&
              update.toolCallId.startsWith(`${WIRE_LAUNCH_ID}:step:`),
          ),
        ).toBe(false);

        const cardEvent = events.find(
          (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
            event.type === "item.started" &&
            (event.payload as Record<string, unknown>).isSubAgent === true,
        );
        const childEvent = events.find(
          (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
            event.type === "item.started" &&
            (event.payload as Record<string, unknown>).kind === "execute",
        );
        expect(childEvent?.parentItemId).toBe(cardEvent?.itemId);

        const beforeDuplicate = ingested.mock.calls.length;
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        expect(ingested.mock.calls.length).toBe(beforeDuplicate);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("launches from the wire when an auto-approved call already carries the spec", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-autospec-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        expect(bridge.onSessionUpdate(autoApprovedWithSpec())).toBe(true);
        await until(() => detachedLaunches(ingested).length > 0);

        const detached = detachedLaunches(ingested);
        expect(detached).toHaveLength(1);
        expect(detached[0]).toMatchObject({
          toolCallId: WIRE_LAUNCH_ID,
          title: "Command Runner",
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("forgets a pending launch when the turn ends", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-approval-turn-end-"));
      try {
        const { bridge, ingested } = setupWireFixture(tempRoot);
        bridge.onSessionUpdate(pendingLaunch());
        bridge.onTurnEnd("cancelled");
        expect(bridge.onSessionUpdate(launchRunning())).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(detachedLaunches(ingested)).toHaveLength(0);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe("child execute wire binding", () => {
    async function startCard(
      bridge: AntigravitySubagentBridge,
      ingested: ReturnType<typeof vi.fn<(notification: SessionNotification) => void>>,
    ): Promise<void> {
      bridge.onSessionUpdate({
        sessionId: WIRE_PARENT_SESSION,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: WIRE_LAUNCH_ID,
          title: "Run invoke_subagent?",
          kind: "other",
          status: "pending",
          rawInput: {
            Subagents: [
              { Model: "inherit", Prompt: "Run pwd", Role: "Command Runner", TypeName: "self" },
            ],
          },
        },
      });
      expect(
        bridge.onSessionUpdate({
          sessionId: WIRE_PARENT_SESSION,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: WIRE_LAUNCH_ID,
            title: WIRE_LAUNCH_TITLE,
            kind: "other",
            status: "in_progress",
            rawInput: {},
          },
        }),
      ).toBe(true);
      await until(() => detachedLaunches(ingested).length > 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    function childWireUpdates(
      ingested: ReturnType<typeof vi.fn<(notification: SessionNotification) => void>>,
      toolCallId = WIRE_EXECUTE_ID,
    ): Record<string, unknown>[] {
      return ingestedUpdates(ingested).filter((update) => update.toolCallId === toolCallId);
    }

    function hasSyntheticRunRow(
      ingested: ReturnType<typeof vi.fn<(notification: SessionNotification) => void>>,
    ): boolean {
      return ingestedUpdates(ingested).some(
        (update) =>
          typeof update.toolCallId === "string" &&
          update.toolCallId.includes(":step:") &&
          (update.kind === "execute" || update.kind === undefined),
      );
    }

    it("binds when the transcript plan arrives before the wire start", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-transcript-first-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        await bridge.flush();

        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteRunning())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();

        const updates = childWireUpdates(ingested);
        expect(updates).toHaveLength(3);
        expect(updates[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
        });
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("binds when the wire start arrives before the transcript plan", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-wire-first-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot, undefined, []);
        await startCard(bridge, ingested);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        expect(childWireUpdates(ingested)).toHaveLength(0);

        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        expect(bridge.onSessionUpdate(wireExecuteRunning())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();

        const updates = childWireUpdates(ingested);
        expect(updates).toHaveLength(3);
        expect(updates[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
        });
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("keeps an approval row live while a child execute is buffered", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-approval-buffer-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);

        const secondApproval: SessionNotification = {
          sessionId: WIRE_PARENT_SESSION,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "parent-1:9",
            title: "Run invoke_subagent?",
            kind: "other",
            status: "pending",
            rawInput: {
              Subagents: [{ Role: "Other", TypeName: "self", Prompt: "Do something else" }],
            },
          },
        };
        expect(bridge.onSessionUpdate(secondApproval)).toBeUndefined();
        expect(ingestedUpdates(ingested).some((update) => update.toolCallId === "parent-1:9")).toBe(
          false,
        );

        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();
        expect(childWireUpdates(ingested)).toHaveLength(2);
        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("binds a denied child execute as failed without a synthetic success", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-denied-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ withExecution: false }),
        );
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        expect(bridge.onSessionUpdate(wireExecuteFailed())).toBe(true);
        await bridge.flush();

        const updates = childWireUpdates(ingested);
        expect(updates).toHaveLength(2);
        expect(updates[1]?.status).toBe("failed");
        expect(updates.some((update) => update.status === "completed")).toBe(false);
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("settles a buffered child execute as failed when the turn is stopped", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-stop-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ withExecution: false }),
        );
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        bridge.onTurnEnd("cancelled");
        await new Promise((resolve) => setTimeout(resolve, 10));

        const updates = childWireUpdates(ingested);
        expect(updates.length).toBeGreaterThanOrEqual(2);
        expect(updates.at(-1)?.status).toBe("failed");
        expect(updates.some((update) => update.status === "completed")).toBe(false);
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("flushes top-level at the deadline when child logs are missing", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-missing-logs-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(
          tempRoot,
          { childExecuteResolveWindowMs: 40 },
          [],
        );
        await startCard(bridge, ingested);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();

        const start = childWireUpdates(ingested)[0];
        expect(start?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        expect(
          (start?._meta as Record<string, unknown> | undefined)?.[
            PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY
          ],
        ).toBeUndefined();

        // Late matching logs must not add a second, synthetic row.
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        await bridge.flush();
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("binds when child logs arrive after the wire start but before the deadline", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-late-logs-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(
          tempRoot,
          { childExecuteResolveWindowMs: 500 },
          [],
        );
        await startCard(bridge, ingested);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 40));

        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();
        expect(childWireUpdates(ingested)).toHaveLength(2);
        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("keeps a wire row top-level when the parent runs the identical command", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-parent-identical-"));
      try {
        const { bridge, ingested, brainRoot, parentTranscript } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 40,
        });
        await startCard(bridge, ingested);
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        writeJsonl(parentTranscript, [...parentSteps(), parentRunCommandStep("pwd", "/w")]);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();

        const start = childWireUpdates(ingested)[0];
        expect(start?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        expect(
          (start?._meta as Record<string, unknown> | undefined)?.[
            PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY
          ],
        ).toBeUndefined();
        expect(hasSyntheticRunRow(ingested)).toBe(true);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("keeps both rows top-level when two wire ids share one child command", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-two-wire-ids-"));
      const secondId = "c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 40,
        });
        await startCard(bridge, ingested);
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteStart({ toolCallId: secondId }))).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();

        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        expect(childWireUpdates(ingested, secondId)[0]?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        expect(hasSyntheticRunRow(ingested)).toBe(true);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("drains a corroborated exit-7 row before a report closes the card", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-drain-exit-"));
      try {
        const { bridge, ingested, brainRoot, parentTranscript } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ exitCode: 7, output: "boom" }),
        );
        writeJsonl(parentTranscript, [...parentSteps(), reportStep()]);
        await bridge.flush();

        const synthetic = ingestedUpdates(ingested).find(
          (update) => typeof update.toolCallId === "string" && update.toolCallId.includes(":step:"),
        );
        expect(synthetic).toMatchObject({
          status: "failed",
          rawOutput: "boom",
          _meta: expect.objectContaining({
            [PORACODE_ACP_COMMAND_STATUS_META_KEY]: { exitCode: 7 },
          }),
        });
        expect(synthetic).not.toHaveProperty("payload.status", "success");
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("emits a planner-only row after bounded staging instead of dropping it", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-planner-only-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 40,
        });
        await startCard(bridge, ingested);
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ withExecution: false }),
        );
        await bridge.flush();
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();

        const synthetic = ingestedUpdates(ingested).find(
          (update) => typeof update.toolCallId === "string" && update.toolCallId.includes(":step:"),
        );
        expect(synthetic).toMatchObject({ status: "failed" });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("routes a deferred child execute start through the matcher", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-deferred-start-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
        expect(bridge.onSessionUpdate(wireLaunchCall())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await until(() => detachedLaunches(ingested).length > 0);
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();

        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: WIRE_LAUNCH_ID,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("reconciles a late wire start with an already emitted synthetic row", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-late-wire-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 40,
        });
        await startCard(bridge, ingested);
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ withExecution: false }),
        );
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();
        const before = ingested.mock.calls.length;

        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        expect(ingested.mock.calls.length).toBe(before);
        expect(hasSyntheticRunRow(ingested)).toBe(true);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("does not rebuffer a repeated pending start after passthrough fallback", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-passthrough-"));
      try {
        const { bridge, ingested } = setupWireFixture(
          tempRoot,
          { childExecuteResolveWindowMs: 20, childExecuteHardDeadlineMs: 50 },
          [],
        );
        await startCard(bridge, ingested);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();
        const before = ingested.mock.calls.length;
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        expect(ingested.mock.calls.length).toBe(before);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("keeps a wire row top-level when sibling children run the identical command", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-sibling-identical-"));
      try {
        const { bridge, ingested } = setupTwoChildFixture(
          tempRoot,
          childRunCommandSteps(),
          childRunCommandSteps(),
          { childExecuteResolveWindowMs: 40 },
        );
        expect(bridge.onSessionUpdate(twoChildLaunch())).toBe(true);
        await until(() => detachedLaunches(ingested).length === 2);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await bridge.flush();
        const start = childWireUpdates(ingested)[0];
        expect(start?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        expect(
          ingestedUpdates(ingested).filter(
            (update) =>
              typeof update.toolCallId === "string" && update.toolCallId.includes(":step:"),
          ),
        ).toHaveLength(2);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("keeps a looking command buffered when another child card reports", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-unrelated-report-"));
      try {
        const { bridge, ingested, parentTranscript } = setupTwoChildFixture(
          tempRoot,
          childRunCommandSteps({ command: "pwd", cwd: "/w" }),
          childRunCommandSteps({ command: "echo hi", cwd: "/w" }),
        );
        expect(bridge.onSessionUpdate(twoChildLaunch())).toBe(true);
        await until(() => detachedLaunches(ingested).length === 2);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);

        writeJsonl(parentTranscript, [...twoChildParentSteps(), reportStepFor(WIRE_CHILD_2_ID)]);
        await bridge.flush();

        // The sibling's report must not settle, claim, or fail this looking row.
        expect(childWireUpdates(ingested)).toHaveLength(0);
        expect(bridge.onSessionUpdate(wireExecuteRunning())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();
        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: WIRE_LAUNCH_ID,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it.each(["turn-change", "dispose"] as const)(
      "invalidates a transcript poll that races %s",
      async (action) => {
        const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-stale-poll-"));
        try {
          const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
          await startCard(bridge, ingested);
          writeJsonl(
            transcriptPath(brainRoot, WIRE_CHILD_ID),
            childRunCommandSteps({ command: "pwd", cwd: "/w" }),
          );
          let resolveRead!: (steps: unknown) => void;
          vi.spyOn(
            bridge as unknown as {
              readTranscriptSteps(dir: string): Promise<unknown>;
            },
            "readTranscriptSteps",
          ).mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                resolveRead = resolve as (steps: unknown) => void;
              }),
          );

          const flushed = bridge.flush();
          await until(() => resolveRead !== undefined);
          if (action === "turn-change") bridge.onTurnStart();
          else bridge.dispose();
          const before = ingested.mock.calls.length;
          resolveRead([reportStepFor(WIRE_CHILD_ID)]);
          await flushed;

          expect(ingested.mock.calls.length).toBe(before);
          expect(
            ingestedUpdates(ingested).some(
              (update) =>
                update.toolCallId === `${WIRE_LAUNCH_ID}:subagent:0` &&
                update.status === "completed",
            ),
          ).toBe(false);
        } finally {
          rmSync(tempRoot, { recursive: true, force: true });
        }
      },
    );

    it("keeps a real sparse permission RPC answerable while a child execute is buffered", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-permission-rpc-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);

        const mapper = createTestMapper("t-permission");
        const permissionEvents: RuntimeEvent[] = [];
        const requests = new AcpSessionRequests({
          threadId: "t-permission",
          getPermissionContext: () => ({ config: undefined, availableModeIds: [] }),
          ensureMapperState: () => mapper.state,
          emitRuntimeEvents: (events) => permissionEvents.push(...events),
          setRequestAttention: () => {},
          createRequestId: () => "perm-sparse" as ThreadServerRequestId,
        });
        const request: RequestPermissionRequest = {
          sessionId: WIRE_PARENT_SESSION,
          toolCall: {
            toolCallId: WIRE_LAUNCH_ID,
            title: "Run invoke_subagent?",
            kind: "other",
            status: "pending",
            rawInput: {},
          },
          options: [
            { optionId: "allow", name: "Allow", kind: "allow_once" },
            { optionId: "deny", name: "Deny", kind: "reject_once" },
          ],
        };
        const answer = requests.requestPermission(request);

        expect(permissionEvents).toContainEqual(
          expect.objectContaining({ type: "request.opened", requestId: "perm-sparse" }),
        );
        expect(
          requests.resolve("perm-sparse" as ThreadServerRequestId, { optionId: "allow" }),
        ).toBe(true);
        await expect(answer).resolves.toEqual({
          outcome: { outcome: "selected", optionId: "allow" },
        });

        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        await bridge.flush();
        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:0`,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("does not hide a distinct parent command behind an emitted child plan", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-late-parent-"));
      try {
        const { bridge, ingested, brainRoot, parentTranscript } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 30,
        });
        await startCard(bridge, ingested);
        const past = new Date(Date.now() - 10_000).toISOString();
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ createdAt: past, executionCreatedAt: past }),
        );
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 40));
        await bridge.flush();
        expect(hasSyntheticRunRow(ingested)).toBe(true);

        writeJsonl(parentTranscript, [...parentSteps(), parentRunCommandStep("pwd", "/w")]);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 40));
        await bridge.flush();

        // The parent command is a distinct row; the late-wire shortcut must
        // not seal it just because the child's synthetic row matches.
        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("re-delivers a parent report consumed before a turn-epoch change", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-lost-report-"));
      try {
        const { bridge, ingested, parentTranscript } = setupWireFixture(tempRoot);
        await startCard(bridge, ingested);
        writeJsonl(parentTranscript, [...parentSteps(), reportStep()]);

        const originalRead = (
          bridge as unknown as {
            readChildTranscriptSteps(root: string, entry: unknown): Promise<unknown>;
          }
        ).readChildTranscriptSteps.bind(bridge);
        let resolveRead!: (steps: unknown) => void;
        let entered!: () => void;
        const ready = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          resolveRead = resolve as (steps: unknown) => void;
        });
        (bridge as unknown as Record<string, unknown>)["readChildTranscriptSteps"] = async (
          root: string,
          entry: unknown,
        ) => {
          entered();
          await gate;
          return originalRead(root, entry);
        };

        const poll = bridge.flush();
        await ready;
        bridge.onTurnStart();
        resolveRead(undefined);
        await poll;
        (bridge as unknown as Record<string, unknown>)["readChildTranscriptSteps"] = originalRead;
        await bridge.flush();

        expect(
          ingestedUpdates(ingested).some(
            (update) =>
              update.toolCallId === `${WIRE_LAUNCH_ID}:subagent:0` && update.status === "completed",
          ),
        ).toBe(true);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("keeps the live opaque approval id from creating a second parented command row", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-live-opaque-"));
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(
          tempRoot,
          { childExecuteResolveWindowMs: 20 },
          [],
        );
        await startCard(bridge, ingested);
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 30));
        await bridge.flush();
        expect(childWireUpdates(ingested)).toHaveLength(1);
        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });

        writeJsonl(transcriptPath(brainRoot, WIRE_CHILD_ID), childRunCommandSteps());
        await bridge.flush();
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("allows one emitted plan to seal at most one wire row", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-consumed-plan-"));
      const secondId = "9f8e7d6c5b4a39281706f5e4d3c2b1a0";
      try {
        const { bridge, ingested, brainRoot } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 20,
        });
        await startCard(bridge, ingested);
        const past = new Date(Date.now() - 10_000).toISOString();
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ createdAt: past, executionCreatedAt: past }),
        );
        await bridge.flush();
        await new Promise((resolve) => setTimeout(resolve, 30));
        await bridge.flush();
        expect(hasSyntheticRunRow(ingested)).toBe(true);

        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();
        expect(childWireUpdates(ingested)).toHaveLength(0);

        expect(bridge.onSessionUpdate(wireExecuteStart({ toolCallId: secondId }))).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await bridge.flush();
        expect(childWireUpdates(ingested, secondId)[0]?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("releases a reserved child plan when a parent plan makes it ambiguous", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-released-reservation-"));
      try {
        const { bridge, ingested, brainRoot, parentTranscript } = setupWireFixture(tempRoot, {
          childExecuteResolveWindowMs: 20,
        });
        await startCard(bridge, ingested);
        const past = new Date(Date.now() - 10_000).toISOString();
        writeJsonl(
          transcriptPath(brainRoot, WIRE_CHILD_ID),
          childRunCommandSteps({ createdAt: past, executionCreatedAt: past }),
        );
        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        await bridge.flush();

        writeJsonl(parentTranscript, [...parentSteps(), parentRunCommandStep("pwd", "/w")]);
        await bridge.flush();

        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        });
        expect(hasSyntheticRunRow(ingested)).toBe(true);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("binds distinct concurrent child calls to their own cards", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "agy-child-distinct-"));
      const echoId = "b7c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5";
      try {
        const { bridge, ingested } = setupTwoChildFixture(
          tempRoot,
          childRunCommandSteps({ command: "pwd", cwd: "/w" }),
          childRunCommandSteps({ command: "echo hi", cwd: "/w" }),
        );
        expect(bridge.onSessionUpdate(twoChildLaunch())).toBe(true);
        await until(() => detachedLaunches(ingested).length === 2);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(bridge.onSessionUpdate(wireExecuteStart())).toBe(true);
        expect(
          bridge.onSessionUpdate(wireExecuteStart({ command: "echo hi", toolCallId: echoId })),
        ).toBe(true);
        await bridge.flush();
        expect(bridge.onSessionUpdate(wireExecuteResult())).toBe(true);
        expect(bridge.onSessionUpdate(wireExecuteResult(echoId))).toBe(true);
        await bridge.flush();

        expect(childWireUpdates(ingested)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: WIRE_LAUNCH_ID,
        });
        expect(childWireUpdates(ingested, echoId)[0]?._meta).toMatchObject({
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: `${WIRE_LAUNCH_ID}:subagent:1`,
        });
        expect(hasSyntheticRunRow(ingested)).toBe(false);
        bridge.dispose();
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
