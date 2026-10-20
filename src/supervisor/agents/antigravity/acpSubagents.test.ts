import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
} from "@/supervisor/agents/acp/canonicalMapping";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
} from "@/supervisor/agents/acp/canonicalMapping/subagents";
import { createAntigravityAcpExtension } from "./acpExtension";
import { transformAntigravitySessionUpdate } from "./acp";
import {
  AntigravitySubagentBridge,
  transformAntigravitySubagentSessionUpdate,
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
      const notify = () =>
        bridge.onSessionUpdate({
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
      notify();
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
