import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { createAcpMapperState, mapAcpSessionUpdate, closeOpenTurnItems } from "../canonicalMapping";
import { extractTaskNotifications, extractBackgroundTaskId } from "./taskNotifications";

function note(update: SessionNotification["update"]): SessionNotification {
  return { sessionId: "s1", update };
}

function agentChunk(text: string): SessionNotification {
  return note({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text },
  } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]);
}

function assistantDeltas(events: ReturnType<typeof mapAcpSessionUpdate>): string[] {
  return events
    .filter(
      (e) => e.type === "content.delta" && (e as { stream?: string }).stream === "assistant_text",
    )
    .map((e) => (e as { delta: string }).delta);
}

const ANTIGRAVITY_MARKDOWN_TASK = `# Background Task Update: \`442d457c-fbe7-4201-8f05-53f7c69bb351/task-32\`

The task exited with the following message:
\`\`\`text
RUN  v4.0.18
 ✓ src/supervisor/agents/codex/windowsExecutable.test.ts (1 test)
\`\`\`

<task_metadata>
task_id: 442d457c-fbe7-4201-8f05-53f7c69bb351/task-32
status: exited
exit_code: 0
</task_metadata>`;

describe("taskNotifications extractor", () => {
  it("extracts Antigravity markdown background task updates", () => {
    const { notifications, cleanText } = extractTaskNotifications(ANTIGRAVITY_MARKDOWN_TASK);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      taskId: "442d457c-fbe7-4201-8f05-53f7c69bb351/task-32",
      exitCode: 0,
    });
    expect(notifications[0]?.output).toContain("windowsExecutable.test.ts");
    expect(cleanText.trim()).toBe("");
  });

  it("maps a markdown background task update onto the tracked command row", () => {
    const state = createAcpMapperState("t-md-task");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-bg",
        title: "node -e setTimeout",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "node -e 'setTimeout(() => console.log(\"waiting\"), 3000)'" },
        rawOutput:
          "Tool is running as a background task with task id: 442d457c-fbe7-4201-8f05-53f7c69bb351/task-32",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const itemId = state.toolCallItems.get("tc-bg")?.itemId;
    expect(itemId).toBeDefined();

    const events = mapAcpSessionUpdate(agentChunk(ANTIGRAVITY_MARKDOWN_TASK), state);
    expect(state.toolCallItems.size).toBe(0);
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "item.completed", itemId })]),
    );
    expect(assistantDeltas(events).join("").trim()).toBe("");
  });

  it("extracts a successful task notification with exit code 0", () => {
    const raw = `<task_notification>
Task 1bc6d974-9b4c-41ad-b800-88aa46277fee/task-304 completed with exit code 0.
Output:
Build succeeded in 3.4s
</task_notification>`;

    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({
      raw: raw.trim(),
      taskId: "1bc6d974-9b4c-41ad-b800-88aa46277fee/task-304",
      exitCode: 0,
      output: "Build succeeded in 3.4s",
    });
    expect(cleanText).toBe("");
  });

  it("extracts a failed task notification with non-zero exit code", () => {
    const raw = `<task_notification>
Task task-error-123 failed with exit code 1.
Output:
fatal: repository not found
</task_notification>`;

    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({
      raw: raw.trim(),
      taskId: "task-error-123",
      exitCode: 1,
      output: "fatal: repository not found",
    });
    expect(cleanText).toBe("");
  });

  it("does not read status or codes from the output text", () => {
    const raw = `<task_notification>
Task t-ok completed with exit code 0.
Output:
0 errors, 3 warnings
</task_notification>`;

    const { notifications } = extractTaskNotifications(raw);
    expect(notifications[0]).toEqual({
      raw: raw.trim(),
      taskId: "t-ok",
      exitCode: 0,
      output: "0 errors, 3 warnings",
    });
  });

  it("removes blocks surgically and preserves all other bytes", () => {
    const raw = `I started the build in the background.

<task_notification>
Task t-1 completed with exit code 0.
Output:
Success
</task_notification>

The build has completed successfully.`;

    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.taskId).toBe("t-1");
    expect(cleanText).toBe(
      "I started the build in the background.\n\n\n\nThe build has completed successfully.",
    );
  });

  it("extracts multiple notifications from a single string", () => {
    const raw = `<task_notification>
Task t-1 completed with exit code 0.
Output:
out 1
</task_notification>
<task_notification>
Task t-2 completed with exit code 0.
Output:
out 2
</task_notification>`;

    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.taskId).toBe("t-1");
    expect(notifications[1]?.taskId).toBe("t-2");
    expect(cleanText).toBe("\n");
  });

  it("returns empty notifications when no tag is present", () => {
    const raw = "Just normal assistant message.";
    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toEqual([]);
    expect(cleanText).toBe(raw);
  });
});

describe("extractBackgroundTaskId", () => {
  it("extracts task ID from string output", () => {
    expect(
      extractBackgroundTaskId(
        'Background task started. Task id: "725d7133-d78d-4fc8-9303-82ae42849a5e/task-30"',
      ),
    ).toBe("725d7133-d78d-4fc8-9303-82ae42849a5e/task-30");

    expect(extractBackgroundTaskId("Task ID: task-42")).toBe("task-42");
    expect(extractBackgroundTaskId("task id is abc-123")).toBe("abc-123");
  });

  it("extracts task ID from structured JSON object", () => {
    expect(extractBackgroundTaskId({ taskId: "task-json-1" })).toBe("task-json-1");
    expect(extractBackgroundTaskId({ task_id: "task-json-2" })).toBe("task-json-2");
  });
});

describe("mapAcpSessionUpdate with task_notification", () => {
  it("converts standalone <task_notification> in agent_message_chunk into a command_execution item", () => {
    const state = createAcpMapperState("t-task-notif");
    const chunk = `<task_notification>
Task 1bc6d974-9b4c-41ad-b800-88aa46277fee/task-304 completed with exit code 0.
Output:
Done building package.
</task_notification>`;

    const events = mapAcpSessionUpdate(agentChunk(chunk), state);

    // No assistant_message should have been opened
    expect(state.openAssistantItemId).toBeUndefined();
    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "assistant_message",
      ),
    ).toBe(false);

    // Should emit command_execution item started & completed
    const started = events.find((e) => e.type === "item.started");
    expect(started).toBeDefined();
    expect((started as { itemType?: string }).itemType).toBe("command_execution");

    const completed = events.find((e) => e.type === "item.completed");
    expect(completed).toBeDefined();
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.status).toBe("success");
    expect(payload?.result).toBe("Done building package.");
    expect(payload?.exitCode).toBe(0);
  });

  it("cleans raw <task_notification> XML out of assistant text deltas", () => {
    const state = createAcpMapperState("t-task-notif-mixed");
    const chunk = `Here is the status:
<task_notification>
Task task-55 completed with exit code 0.
Output:
All tests passed.
</task_notification>
Everything looks great!`;

    const events = mapAcpSessionUpdate(agentChunk(chunk), state);

    // Should emit command_execution events
    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "command_execution",
      ),
    ).toBe(true);

    // Should emit assistant delta without any <task_notification> tags
    const delta = events.find(
      (e) => e.type === "content.delta" && (e as { stream?: string }).stream === "assistant_text",
    );
    expect(delta).toBeDefined();
    const text = (delta as { delta: string }).delta;
    expect(text).not.toContain("<task_notification>");
    expect(text).not.toContain("</task_notification>");
    expect(text).toContain("Here is the status:");
    expect(text).toContain("Everything looks great!");
  });

  it("preserves whitespace seams around removed blocks across chunks", () => {
    const state = createAcpMapperState("t-task-seam");
    const events1 = mapAcpSessionUpdate(
      agentChunk(
        "Here is the status:\n<task_notification>\nTask t-6 completed with exit code 0.\nOutput:\nok\n</task_notification>\n\n",
      ),
      state,
    );
    const events2 = mapAcpSessionUpdate(agentChunk("All done."), state);
    expect([...assistantDeltas(events1), ...assistantDeltas(events2)].join("")).toBe(
      "Here is the status:\n\n\nAll done.",
    );
  });

  it("buffers partial <task_notification> across streaming chunks", () => {
    const state = createAcpMapperState("t-task-buffer");

    // Chunk 1: Starts the notification tag but doesn't finish it
    const events1 = mapAcpSessionUpdate(
      agentChunk("Notice: <task_notification>\nTask task-chunked-1 completed with exit"),
      state,
    );

    // The text prefix "Notice: " should be emitted
    expect(assistantDeltas(events1).join("")).toBe("Notice: ");

    // The partial tag is buffered in state
    expect(state.taskNotificationBuffer).toEqual({
      parentToolCallId: undefined,
      text: "<task_notification>\nTask task-chunked-1 completed with exit",
    });

    // Chunk 2: Completes the notification tag
    const events2 = mapAcpSessionUpdate(
      agentChunk(" code 0.\nOutput:\nFinished chunk.\n</task_notification>"),
      state,
    );

    expect(state.taskNotificationBuffer).toBeUndefined();
    const completed = events2.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.command !== undefined,
    );
    expect(completed).toBeDefined();
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.status).toBe("success");
    expect(payload?.result).toBe("Finished chunk.");
  });

  it("buffers a partial second notification following a complete one", () => {
    const state = createAcpMapperState("t-task-two");
    const events1 = mapAcpSessionUpdate(
      agentChunk(
        `<task_notification>
Task t-1 completed with exit code 0.
Output:
ok1
</task_notification><task_notification>
Task t-2 completed with exit`,
      ),
      state,
    );

    // The first notification resolved; the second is buffered, not streamed.
    expect(
      events1.some(
        (e) =>
          e.type === "item.completed" &&
          (e as { payload?: Record<string, unknown> }).payload?.result === "ok1",
      ),
    ).toBe(true);
    for (const delta of assistantDeltas(events1)) {
      expect(delta).not.toContain("<task_notification>");
    }
    expect(state.taskNotificationBuffer?.text.startsWith("<task_notification>")).toBe(true);

    const events2 = mapAcpSessionUpdate(
      agentChunk(" code 0.\nOutput:\nok2\n</task_notification>"),
      state,
    );
    for (const delta of assistantDeltas(events2)) {
      expect(delta).not.toContain("<task_notification>");
    }
    const completed2 = events2.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.result === "ok2",
    );
    expect(completed2).toBeDefined();
    expect((completed2 as { payload?: Record<string, unknown> }).payload?.name as string).toBe(
      "Task t-2",
    );
  });

  it("holds a split open tag across chunks without leaking the fragment", () => {
    const state = createAcpMapperState("t-task-split");
    const events1 = mapAcpSessionUpdate(agentChunk("See <task_no"), state);
    expect(state.taskNotificationBuffer?.text).toBe("<task_no");
    expect(assistantDeltas(events1).join("")).toBe("See ");

    const events2 = mapAcpSessionUpdate(
      agentChunk(
        "tification>\nTask t-3 failed with exit code 2.\nOutput:\nboom\n</task_notification>",
      ),
      state,
    );
    expect(state.taskNotificationBuffer).toBeUndefined();
    const allDeltas = [...assistantDeltas(events1), ...assistantDeltas(events2)].join("");
    expect(allDeltas).not.toContain("<task");
    const completed = events2.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.name !== undefined,
    );
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.name).toBe("Task t-3");
    expect(payload?.exitCode).toBe(2);
    expect(payload?.result).toBe("boom");
  });

  it("holds the buffer across agent_thought_chunk and resolves on the next chunk", () => {
    const state = createAcpMapperState("t-task-hold");
    mapAcpSessionUpdate(agentChunk("<task_notification>\nTask t-4 completed with exit"), state);
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(state.taskNotificationBuffer?.text).toContain("<task_notification>");

    const events = mapAcpSessionUpdate(
      agentChunk(" code 0.\nOutput:\nok4\n</task_notification>"),
      state,
    );
    for (const delta of assistantDeltas(events)) {
      expect(delta).not.toContain("<task_notification>");
    }
    const completed = events.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.result === "ok4",
    );
    expect(completed).toBeDefined();
    expect(state.taskNotificationBuffer).toBeUndefined();
  });

  it("completes a truncated notification at the turn boundary", () => {
    const state = createAcpMapperState("t-task-trunc");
    mapAcpSessionUpdate(
      agentChunk(
        "prefix <task_notification>\nTask t-5 completed with exit code 0.\nOutput:\npartial out",
      ),
      state,
    );
    expect(state.taskNotificationBuffer).toBeDefined();

    const events = closeOpenTurnItems(state);
    const completed = events.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.result === "partial out",
    );
    expect(completed).toBeDefined();
    expect((completed as { payload?: Record<string, unknown> }).payload?.name as string).toBe(
      "Task t-5",
    );
    for (const delta of assistantDeltas(events)) {
      expect(delta).not.toContain("<task_notification>");
    }
    expect(state.taskNotificationBuffer).toBeUndefined();
  });

  it("flushes incomplete taskNotificationBuffer on turn end", () => {
    const state = createAcpMapperState("t-turn-end");
    state.taskNotificationBuffer = {
      parentToolCallId: undefined,
      text: "incomplete task notification text",
    };

    const events = closeOpenTurnItems(state);
    expect(state.taskNotificationBuffer).toBeUndefined();

    // Should have emitted assistant item with the remaining text
    const delta = events.find((e) => e.type === "content.delta");
    expect(delta).toBeDefined();
    expect((delta as { delta: string }).delta).toBe("incomplete task notification text");
  });
});

describe("background task correlation", () => {
  function startBackgroundTool(
    state: ReturnType<typeof createAcpMapperState>,
    toolCallId: string,
    rawOutput: string,
  ): string {
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId,
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "pnpm build" },
        rawOutput,
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events.find((e) => e.type === "item.started");
    return (started as { itemId: string }).itemId;
  }

  it("registers a background task from a real tool_call and seals the live item", () => {
    const state = createAcpMapperState("t-task-link-flow");
    const toolItemId = startBackgroundTool(
      state,
      "tc-bg",
      'Tool is running as a background task with task id: "bg-task-999"',
    );
    expect(state.backgroundTasks.get("bg-task-999")?.toolCallId).toBe("tc-bg");
    expect(state.backgroundTasks.get("bg-task-999")?.itemId).toBe(toolItemId);
    expect(state.toolCallItems.has("tc-bg")).toBe(true);

    const events = mapAcpSessionUpdate(
      agentChunk(`<task_notification>
Task bg-task-999 completed with exit code 0.
Output:
Finished release [optimized] target(s) in 12.34s
</task_notification>`),
      state,
    );

    const completed = events.find((e) => e.type === "item.completed");
    expect(completed).toBeDefined();
    expect((completed as { itemId: string }).itemId).toBe(toolItemId);
    const payload = (completed as { payload: Record<string, unknown> }).payload;
    expect(payload.command).toBe("pnpm build");
    expect(payload.result).toBe("Finished release [optimized] target(s) in 12.34s");
    expect(payload.status).toBe("success");
    expect(payload.exitCode).toBe(0);

    // The notification consumed the tracking entry and sealed the live
    // tool-call item, so the turn-boundary close cannot re-complete the row
    // with the stale pre-notification payload.
    expect(state.backgroundTasks.has("bg-task-999")).toBe(false);
    expect(state.toolCallItems.has("tc-bg")).toBe(false);
    const closeEvents = closeOpenTurnItems(state);
    expect(
      closeEvents.filter(
        (e) => e.type === "item.completed" && (e as { itemId: string }).itemId === toolItemId,
      ),
    ).toHaveLength(0);
  });

  it("does not let a foreground command mentioning a task id steal the correlation", () => {
    const state = createAcpMapperState("t-task-theft");
    const bgItemId = startBackgroundTool(
      state,
      "tc-bg",
      'Tool is running as a background task with task id: "TID-9"',
    );
    // A foreground command whose output merely mentions the same id.
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fg",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "cat notes.txt" },
        rawOutput: "waiting on task id TID-9",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const tracked = state.backgroundTasks.get("TID-9");
    expect(tracked?.toolCallId).toBe("tc-bg");
    expect(tracked?.itemId).toBe(bgItemId);
  });

  it("ignores command output that mentions a task id without a background signal", () => {
    const state = createAcpMapperState("t-task-signal");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fg",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "echo done" },
        rawOutput: "Printed task id list",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(state.backgroundTasks.size).toBe(0);
  });
  it("correlates Antigravity <SYSTEM_MESSAGE> task notification with tracked command", () => {
    const state = createAcpMapperState("t-task-sys-msg");
    const toolItemId = startBackgroundTool(
      state,
      "tc-sys-bg",
      "Tool is running as a background task with task id: 73526519-fd6d-4046-bce4-fbff4810f266/task-442",
    );
    expect(state.backgroundTasks.get("73526519-fd6d-4046-bce4-fbff4810f266/task-442")?.itemId).toBe(
      toolItemId,
    );

    const rawSysMsg = [
      "The following is a <SYSTEM_MESSAGE> not actually sent by the user. It is provided by the system as important information to pay attention to.",
      "",
      "<SYSTEM_MESSAGE>",
      '[Message] timestamp=2026-08-31T05:25:34Z sender=73526519-fd6d-4046-bce4-fbff4810f266/task-442 priority=MESSAGE_PRIORITY_HIGH content=Task id "73526519-fd6d-4046-bce4-fbff4810f266/task-442" finished with result:',
      "",
      "The command exited with code 0.",
      "Stdout:",
      "commit created successfully",
      "",
      "Stderr:",
      "",
      "Log: file:///C:/Users/sdsle/.gemini/antigravity-acp/brain/73526519-fd6d-4046-bce4-fbff4810f266/.system_generated/tasks/task-442.log",
      "</SYSTEM_MESSAGE>",
    ].join("\n");

    const events = mapAcpSessionUpdate(agentChunk(rawSysMsg), state);

    const completed = events.find((e) => e.type === "item.completed");
    expect(completed).toBeDefined();
    expect((completed as { itemId: string }).itemId).toBe(toolItemId);
    const payload = (completed as { payload: Record<string, unknown> }).payload;
    expect(payload.result).toBe("commit created successfully");
    expect(payload.exitCode).toBe(0);
    expect(payload.status).toBe("success");

    const asstStarted = events.find(
      (e) =>
        e.type === "item.started" && (e as { itemType?: string }).itemType === "assistant_message",
    );
    expect(asstStarted).toBeUndefined();
    for (const delta of assistantDeltas(events)) {
      expect(delta).not.toContain("<SYSTEM_MESSAGE>");
      expect(delta).not.toContain("not actually sent by the user");
    }
  });

  it("handles standalone Antigravity <SYSTEM_MESSAGE> task notification when untracked", () => {
    const state = createAcpMapperState("t-task-sys-untracked");
    const rawSysMsg = [
      "<SYSTEM_MESSAGE>",
      '[Message] timestamp=2026-08-31T05:25:34Z sender=some-uuid/task-999 priority=MESSAGE_PRIORITY_HIGH content=Task id "some-uuid/task-999" finished with result:',
      "",
      "The command exited with code 1.",
      "Stdout:",
      "",
      "Stderr:",
      "compilation error TS1005",
      "",
      "Log: file:///path/to/log",
      "</SYSTEM_MESSAGE>",
    ].join("\n");

    const events = mapAcpSessionUpdate(agentChunk(rawSysMsg), state);
    const started = events.find(
      (e) =>
        e.type === "item.started" && (e as { itemType?: string }).itemType === "command_execution",
    );
    expect(started).toBeDefined();
    const completed = events.find((e) => e.type === "item.completed");
    expect(completed).toBeDefined();
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.exitCode).toBe(1);
    expect(payload?.status).toBe("error");
    expect(payload?.result).toBe("compilation error TS1005");
  });
});

const MARKDOWN_BACKGROUND_UPDATE = `# Background Task Update: \`442d457c-fbe7-4201-8f05-53f7c69bb351/task-32\`

The task exited with the following message:
\`\`\`text
RUN  v4.0.18 E:/work/lightcode/.poracode/worktrees/fix-pnpm-global-shims-windows

 ✓ src/supervisor/agents/codex/windowsExecutable.test.ts (1 test) 8ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
\`\`\`

<task_metadata>
task_id: 442d457c-fbe7-4201-8f05-53f7c69bb351/task-32
status: exited
exit_code: 0
</task_metadata>`;

describe("markdown Background Task Update", () => {
  it("extracts a complete markdown background task update and strips it from assistant text", () => {
    const { notifications, cleanText } = extractTaskNotifications(MARKDOWN_BACKGROUND_UPDATE);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.taskId).toBe("442d457c-fbe7-4201-8f05-53f7c69bb351/task-32");
    expect(notifications[0]?.exitCode).toBe(0);
    expect(notifications[0]?.output).toContain("RUN  v4.0.18");
    expect(notifications[0]?.output).toContain("Test Files  1 passed (1)");
    expect(cleanText.trim()).toBe("");
  });

  it("preserves surrounding assistant text around a markdown background task update", () => {
    const raw = `I started the tests in the background.\n\n${MARKDOWN_BACKGROUND_UPDATE}\n\nThey finished.`;
    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toHaveLength(1);
    expect(cleanText).toBe("I started the tests in the background.\n\n\n\nThey finished.");
  });

  it("does not treat ordinary prose as a background task update", () => {
    const raw = "Just normal assistant message about a background job.";
    const { notifications, cleanText } = extractTaskNotifications(raw);
    expect(notifications).toEqual([]);
    expect(cleanText).toBe(raw);
  });

  it("converts a standalone markdown update into a command_execution item with no assistant leak", () => {
    const state = createAcpMapperState("t-bg-md");
    const events = mapAcpSessionUpdate(agentChunk(MARKDOWN_BACKGROUND_UPDATE), state);

    expect(state.openAssistantItemId).toBeUndefined();
    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "assistant_message",
      ),
    ).toBe(false);

    const started = events.find((e) => e.type === "item.started");
    expect(started).toBeDefined();
    expect((started as { itemType?: string }).itemType).toBe("command_execution");
    const completed = events.find((e) => e.type === "item.completed");
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.status).toBe("success");
    expect(payload?.exitCode).toBe(0);
    expect(payload?.result).toContain("RUN  v4.0.18");
    expect(assistantDeltas(events).join("")).toBe("");
  });

  it("strips a markdown update mixed into assistant text", () => {
    const state = createAcpMapperState("t-bg-md-mixed");
    const events = mapAcpSessionUpdate(
      agentChunk(`Here is the status:\n${MARKDOWN_BACKGROUND_UPDATE}\nEverything looks great!`),
      state,
    );
    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "command_execution",
      ),
    ).toBe(true);
    const text = assistantDeltas(events).join("");
    expect(text).not.toContain("Background Task Update");
    expect(text).not.toContain("<task_metadata>");
    expect(text).toContain("Here is the status:");
    expect(text).toContain("Everything looks great!");
  });

  it("buffers a markdown update streamed across chunks", () => {
    const state = createAcpMapperState("t-bg-md-buffer");
    const splitAt = MARKDOWN_BACKGROUND_UPDATE.indexOf("```text");
    const first = MARKDOWN_BACKGROUND_UPDATE.slice(0, splitAt);
    const second = MARKDOWN_BACKGROUND_UPDATE.slice(splitAt);

    const events1 = mapAcpSessionUpdate(agentChunk(`Notice:\n${first}`), state);
    expect(assistantDeltas(events1).join("")).toBe("Notice:\n");
    expect(state.taskNotificationBuffer?.text.startsWith("# Background Task Update:")).toBe(true);

    const events2 = mapAcpSessionUpdate(agentChunk(second), state);
    expect(state.taskNotificationBuffer).toBeUndefined();
    for (const delta of assistantDeltas(events2)) {
      expect(delta).not.toContain("Background Task Update");
      expect(delta).not.toContain("<task_metadata>");
    }
    const completed = events2.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.exitCode === 0,
    );
    expect(completed).toBeDefined();
    expect((completed as { payload?: Record<string, unknown> }).payload?.result).toContain(
      "RUN  v4.0.18",
    );
  });

  it("holds a split markdown heading without leaking the fragment", () => {
    const state = createAcpMapperState("t-bg-md-split");
    const events1 = mapAcpSessionUpdate(agentChunk("See # Back"), state);
    expect(assistantDeltas(events1).join("")).toBe("See ");
    expect(state.taskNotificationBuffer?.text).toBe("# Back");

    const rest = MARKDOWN_BACKGROUND_UPDATE.slice("# Back".length);
    const events2 = mapAcpSessionUpdate(agentChunk(rest), state);
    expect(state.taskNotificationBuffer).toBeUndefined();
    const allDeltas = [...assistantDeltas(events1), ...assistantDeltas(events2)].join("");
    expect(allDeltas).not.toContain("Background Task Update");
    expect(allDeltas).not.toContain("<task_metadata>");
    const completed = events2.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.name !== undefined,
    );
    expect((completed as { payload?: Record<string, unknown> }).payload?.exitCode).toBe(0);
  });

  it("does not hold an ordinary markdown heading that merely starts with a hash", () => {
    const state = createAcpMapperState("t-bg-md-heading");
    const events = mapAcpSessionUpdate(agentChunk("# Installation\n\nRun pnpm install."), state);
    expect(state.taskNotificationBuffer).toBeUndefined();
    expect(assistantDeltas(events).join("")).toBe("# Installation\n\nRun pnpm install.");
  });

  it("completes a truncated markdown update at the turn boundary", () => {
    const state = createAcpMapperState("t-bg-md-trunc");
    mapAcpSessionUpdate(
      agentChunk(
        "# Background Task Update: `t-5`\n\nThe task exited with the following message:\npartial out",
      ),
      state,
    );
    expect(state.taskNotificationBuffer).toBeDefined();

    const events = closeOpenTurnItems(state);
    const completed = events.find(
      (e) =>
        e.type === "item.completed" &&
        (e as { payload?: Record<string, unknown> }).payload?.result === "partial out",
    );
    expect(completed).toBeDefined();
    expect((completed as { payload?: Record<string, unknown> }).payload?.name as string).toBe(
      "Task t-5",
    );
    for (const delta of assistantDeltas(events)) {
      expect(delta).not.toContain("Background Task Update");
    }
    expect(state.taskNotificationBuffer).toBeUndefined();
  });

  it("correlates a markdown update with a tracked background command", () => {
    const state = createAcpMapperState("t-bg-md-link");
    const toolItemId = (() => {
      const events = mapAcpSessionUpdate(
        note({
          sessionUpdate: "tool_call",
          toolCallId: "tc-bg-md",
          title: "shell exec",
          kind: "execute",
          status: "in_progress",
          rawInput: { command: "pnpm exec vitest run windowsExecutable.test.ts" },
          rawOutput:
            'Tool is running as a background task with task id: "442d457c-fbe7-4201-8f05-53f7c69bb351/task-32"',
        } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
        state,
      );
      const started = events.find((e) => e.type === "item.started");
      return (started as { itemId: string }).itemId;
    })();

    const events = mapAcpSessionUpdate(agentChunk(MARKDOWN_BACKGROUND_UPDATE), state);
    const completed = events.find((e) => e.type === "item.completed");
    expect((completed as { itemId: string }).itemId).toBe(toolItemId);
    const payload = (completed as { payload: Record<string, unknown> }).payload;
    expect(payload.command).toBe("pnpm exec vitest run windowsExecutable.test.ts");
    expect(payload.result).toContain("Test Files  1 passed (1)");
    expect(payload.exitCode).toBe(0);
    expect(payload.status).toBe("success");
    expect(state.backgroundTasks.has("442d457c-fbe7-4201-8f05-53f7c69bb351/task-32")).toBe(false);

    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "assistant_message",
      ),
    ).toBe(false);
  });

  it("does not hold a trailing English 'the' as a SYSTEM_MESSAGE preamble fragment", () => {
    const state = createAcpMapperState("t-bg-md-the");
    const events = mapAcpSessionUpdate(agentChunk("I think the"), state);
    expect(state.taskNotificationBuffer).toBeUndefined();
    expect(assistantDeltas(events).join("")).toBe("I think the");
  });

  it("leaves a bare task_metadata example in assistant text", () => {
    const state = createAcpMapperState("t-bg-md-example");
    const raw = `Here is the format:

<task_metadata>
task_id: example
status: exited
exit_code: 0
</task_metadata>`;
    const events = mapAcpSessionUpdate(agentChunk(raw), state);
    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "command_execution",
      ),
    ).toBe(false);
    expect(assistantDeltas(events).join("")).toBe(raw);
  });

  it("maps a failed markdown update to an error command_execution without assistant leak", () => {
    const state = createAcpMapperState("t-bg-md-fail");
    const raw = `# Background Task Update: \`t-fail\`

The task exited with the following message:
\`\`\`text
boom
\`\`\`

<task_metadata>
task_id: t-fail
status: failed
exit_code: 2
</task_metadata>`;
    const events = mapAcpSessionUpdate(agentChunk(raw), state);
    expect(
      events.some(
        (e) =>
          e.type === "item.started" &&
          (e as { itemType?: string }).itemType === "assistant_message",
      ),
    ).toBe(false);
    const completed = events.find((e) => e.type === "item.completed");
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.status).toBe("error");
    expect(payload?.exitCode).toBe(2);
    expect(payload?.result).toBe("boom");
  });

  it("completes an empty-output markdown update as a command row", () => {
    const state = createAcpMapperState("t-bg-md-empty");
    const raw = `# Background Task Update: \`t-empty\`

<task_metadata>
task_id: t-empty
status: exited
exit_code: 0
</task_metadata>`;
    const events = mapAcpSessionUpdate(agentChunk(raw), state);
    const started = events.find(
      (e) =>
        e.type === "item.started" && (e as { itemType?: string }).itemType === "command_execution",
    );
    expect(started).toBeDefined();
    expect(events.some((e) => e.type === "content.delta")).toBe(false);
    const payload = (
      events.find((e) => e.type === "item.completed") as { payload?: Record<string, unknown> }
    ).payload;
    expect(payload?.status).toBe("success");
    expect(payload?.result).toBe("");
    expect(assistantDeltas(events).join("")).toBe("");
  });

  it("reads exit_code from unterminated metadata when the turn ends", () => {
    const state = createAcpMapperState("t-bg-md-trunc-code");
    mapAcpSessionUpdate(
      agentChunk(`# Background Task Update: \`t-1\`

The task exited with the following message:
\`\`\`text
boom
\`\`\`
<task_metadata>
task_id: t-1
status: failed
exit_code: 2
`),
      state,
    );
    const events = closeOpenTurnItems(state);
    const completed = events.find((e) => e.type === "item.completed");
    const payload = (completed as { payload?: Record<string, unknown> }).payload;
    expect(payload?.exitCode).toBe(2);
    expect(payload?.status).toBe("error");
    expect(payload?.result).toBe("boom");
    expect(assistantDeltas(events).join("")).toBe("");
  });

  it("holds a five-character heading fragment", () => {
    const state = createAcpMapperState("t-bg-md-bac");
    const events1 = mapAcpSessionUpdate(agentChunk("See # Bac"), state);
    expect(assistantDeltas(events1).join("")).toBe("See ");
    expect(state.taskNotificationBuffer?.text).toBe("# Bac");
  });
});
