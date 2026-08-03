import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { createGrokAcpSessionUpdateTransform } from "./acpTransform";

const PARENT_SESSION_ID = "parent-session";
const CHILD_SESSION_ID = "child-session";
const TOOL_CALL_ID = "spawn-call";

function notification(sessionId: string, update: Record<string, unknown>): SessionNotification {
  return { sessionId, update } as unknown as SessionNotification;
}

describe("createGrokAcpSessionUpdateTransform", () => {
  it("maps Grok goal extension updates into the canonical goal lifecycle", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");

    const started = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "goal_updated",
          goal_id: "goal-1",
          objective: "Update README",
          status: "active",
          phase: "executing",
          token_budget: 100_000,
          tokens_used: 12_500,
          elapsed_ms: 4_500,
          total_worker_rounds: 2,
          total_verify_rounds: 1,
          classifier_runs_attempted: 1,
          last_event: "worker_completed",
        }),
      ),
      state,
    );

    expect(started).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.started",
          itemType: "goal",
          payload: expect.objectContaining({
            action: "set",
            objective: "Update README",
            status: "active",
            tokenBudget: 100_000,
            tokensUsed: 12_500,
            timeUsedSeconds: 4.5,
            iterations: 1,
            availableActions: ["pause", "clear"],
            providerThreadId: "goal-1",
          }),
        }),
      ]),
    );

    const paused = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "goal_updated",
          goal_id: "goal-1",
          objective: "Update README",
          status: "user_paused",
          phase: "executing",
          tokens_used: 20_000,
          elapsed_ms: 8_000,
          total_worker_rounds: 2,
          total_verify_rounds: 1,
          last_event_detail: "user",
        }),
      ),
      state,
    );

    expect(paused).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({
            action: "updated",
            status: "paused",
            availableActions: ["resume", "clear"],
            lastReason: "user",
          }),
        }),
      ]),
    );

    const cleared = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "goal_updated",
          goal_id: "",
          objective: "",
          status: "cleared",
          phase: "idle",
        }),
      ),
      state,
    );
    expect(cleared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({ action: "cleared", availableActions: [] }),
        }),
      ]),
    );
  });

  it("routes Grok child-session chat under its background subagent card", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");

    const launchEvents = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "tool_call",
          toolCallId: TOOL_CALL_ID,
          title: "spawn_subagent",
          rawInput: {
            prompt: "Review README",
            description: "README accuracy review",
            subagent_type: "general-purpose",
            background: true,
          },
          _meta: {
            "x.ai/tool": { name: "spawn_subagent" },
          },
        }),
      ),
      state,
    );
    const parentStart = launchEvents.find(
      (event) =>
        event.type === "item.started" &&
        (event.payload as Record<string, unknown> | undefined)?.isSubAgent === true,
    );
    const parentItemId = parentStart?.type === "item.started" ? parentStart.itemId : undefined;
    expect(parentItemId).toBeDefined();
    const parentArgs =
      parentStart?.type === "item.started" &&
      parentStart.payload &&
      typeof parentStart.payload === "object" &&
      !Array.isArray(parentStart.payload)
        ? (parentStart.payload as Record<string, unknown>).args
        : undefined;
    expect(parentArgs).not.toHaveProperty("subagent_type");

    const receipt = transform(
      notification(PARENT_SESSION_ID, {
        sessionUpdate: "tool_call_update",
        toolCallId: TOOL_CALL_ID,
        status: "completed",
        rawOutput: { type: "Text", text: "Subagent started in background." },
      }),
    );
    expect(receipt.update).toMatchObject({ status: "in_progress" });
    expect(mapAcpSessionUpdate(receipt, state)).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );

    expect(
      mapAcpSessionUpdate(
        transform(
          notification(PARENT_SESSION_ID, {
            sessionUpdate: "subagent_spawned",
            subagent_id: CHILD_SESSION_ID,
            child_session_id: CHILD_SESSION_ID,
            parent_session_id: PARENT_SESSION_ID,
            subagent_type: "general-purpose",
            description: "README accuracy review (provider normalized)",
          }),
        ),
        state,
      ),
    ).toEqual([]);

    const childEvents = mapAcpSessionUpdate(
      transform(
        notification(CHILD_SESSION_ID, {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Inspecting README" },
        }),
      ),
      state,
    );
    expect(childEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "reasoning",
        parentItemId,
      }),
    );

    const parentEvents = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Waiting for the review" },
        }),
      ),
      state,
    );
    expect(parentEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "reasoning",
      }),
    );
    expect(parentEvents).not.toContainEqual(
      expect.objectContaining({ type: "item.started", parentItemId }),
    );

    expect(
      mapAcpSessionUpdate(
        transform(
          notification(PARENT_SESSION_ID, {
            sessionUpdate: "tool_call",
            toolCallId: "task-output-call",
            title: "get_command_or_subagent_output",
            rawInput: { task_ids: [CHILD_SESSION_ID] },
          }),
        ),
        state,
      ),
    ).toEqual([]);

    const finished = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "subagent_finished",
          subagent_id: CHILD_SESSION_ID,
          child_session_id: CHILD_SESSION_ID,
          status: "completed",
          output: "README review complete",
        }),
      ),
      state,
    );
    expect(finished).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({ result: "README review complete" }),
      }),
    );

    expect(
      mapAcpSessionUpdate(
        transform(
          notification(PARENT_SESSION_ID, {
            sessionUpdate: "tool_call_update",
            toolCallId: "task-output-call",
            status: "completed",
            rawOutput: {
              type: "TaskOutput",
              Result: {
                task_id: CHILD_SESSION_ID,
                status: "completed",
                output: "Full README comparison",
                truncated: false,
              },
            },
          }),
        ),
        state,
      ),
    ).toEqual([]);

    expect(
      mapAcpSessionUpdate(
        transform(
          notification(CHILD_SESSION_ID, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "late child output" },
          }),
        ),
        state,
      ),
    ).toEqual([]);
  });

  it("keeps interleaved Grok child-session reasoning under the correct subagent cards", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    const childSessions = ["child-a", "child-b"];
    const parentItemIds = childSessions.map((childSessionId) => {
      const toolCallId = `spawn-${childSessionId}`;
      const description = `Review ${childSessionId}`;
      const events = mapAcpSessionUpdate(
        transform(
          notification(PARENT_SESSION_ID, {
            sessionUpdate: "tool_call",
            toolCallId,
            title: "spawn_subagent",
            rawInput: {
              prompt: description,
              description,
              subagent_type: "explore",
              background: true,
            },
          }),
        ),
        state,
      );
      mapAcpSessionUpdate(
        transform(
          notification(PARENT_SESSION_ID, {
            sessionUpdate: "subagent_spawned",
            child_session_id: childSessionId,
            parent_session_id: PARENT_SESSION_ID,
            subagent_type: "explore",
            description,
          }),
        ),
        state,
      );
      const started = events.find(
        (event) =>
          event.type === "item.started" &&
          (event.payload as Record<string, unknown> | undefined)?.isSubAgent === true,
      );
      expect(started?.type).toBe("item.started");
      return started?.type === "item.started" ? started.itemId : undefined;
    });

    const reasoningItemIds: string[] = [];
    for (const [index, childSessionId] of childSessions.entries()) {
      const events = mapAcpSessionUpdate(
        transform(
          notification(childSessionId, {
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: `Reasoning from ${childSessionId}` },
          }),
        ),
        state,
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.started",
          itemType: "reasoning",
          parentItemId: parentItemIds[index],
        }),
      );
      const started = events.find(
        (event) => event.type === "item.started" && event.itemType === "reasoning",
      );
      if (started?.type === "item.started") reasoningItemIds[index] = started.itemId;
    }

    for (const [index, childSessionId] of childSessions.entries()) {
      const events = mapAcpSessionUpdate(
        transform(
          notification(childSessionId, {
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: ` continued ${childSessionId}` },
          }),
        ),
        state,
      );
      expect(events).not.toContainEqual(expect.objectContaining({ type: "item.started" }));
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "content.delta",
          itemId: reasoningItemIds[index],
          delta: ` continued ${childSessionId}`,
        }),
      );
    }
  });

  it("surfaces internal Grok goal subagents that keep the parent thread working", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");

    const launchEvents = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "subagent_spawned",
          subagent_id: CHILD_SESSION_ID,
          child_session_id: CHILD_SESSION_ID,
          parent_session_id: PARENT_SESSION_ID,
          subagent_type: "general-purpose",
          description: "goal achievement skeptic",
        }),
      ),
      state,
    );
    const parentStart = launchEvents.find(
      (event) =>
        event.type === "item.started" &&
        (event.payload as Record<string, unknown> | undefined)?.isSubAgent === true,
    );
    const parentItemId = parentStart?.type === "item.started" ? parentStart.itemId : undefined;
    expect(parentStart).toMatchObject({
      type: "item.started",
      payload: expect.objectContaining({
        status: "running",
        args: expect.objectContaining({
          description: "goal achievement skeptic",
          background: true,
        }),
      }),
    });
    const parentArgs =
      parentStart?.type === "item.started" &&
      parentStart.payload &&
      typeof parentStart.payload === "object" &&
      !Array.isArray(parentStart.payload)
        ? (parentStart.payload as Record<string, unknown>).args
        : undefined;
    expect(parentArgs).not.toHaveProperty("subagent_type");

    const childEvents = mapAcpSessionUpdate(
      transform(
        notification(CHILD_SESSION_ID, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Checking whether the goal is complete" },
        }),
      ),
      state,
    );
    expect(childEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId,
      }),
    );

    const finished = mapAcpSessionUpdate(
      transform(
        notification(PARENT_SESSION_ID, {
          sessionUpdate: "subagent_finished",
          subagent_id: CHILD_SESSION_ID,
          child_session_id: CHILD_SESSION_ID,
          status: "completed",
        }),
      ),
      state,
    );
    expect(finished).toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );
  });
});
