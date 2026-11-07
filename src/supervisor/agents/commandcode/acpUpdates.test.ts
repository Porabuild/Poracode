import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { CommandCodeSubagentSteps, normalizeCommandCodeSessionUpdate } from "./acpUpdates";

describe("Command Code native ACP agent calls", () => {
  it("renders the bundled default agent as a subagent when no subtype is supplied", () => {
    const notification = normalizeCommandCodeSessionUpdate({
      sessionId: "native-session",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "agent-1",
        title: "agent",
        kind: "other",
        status: "in_progress",
        rawInput: { description: "Read-only research", prompt: "Explain a concept" },
      },
    });
    const events = mapAcpSessionUpdate(notification, createAcpMapperState("thread-1"));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.started",
          payload: expect.objectContaining({ isSubAgent: true }),
        }),
      ]),
    );
  });

  it("does not reinterpret ordinary tools", () => {
    const notification = {
      sessionId: "session",
      update: {
        sessionUpdate: "tool_call" as const,
        toolCallId: "tool",
        title: "read_file",
        rawInput: { file_path: "README.md" },
      },
    };
    expect(normalizeCommandCodeSessionUpdate(notification)).toBe(notification);
  });

  // Native 1.88.2 subagent_progress is content on the parent call, with no
  // status, child tool id, structured arguments, or result. Existing stored
  // messages remain valid; this only corrects normalization of new updates.
  const agentCall = (id = "agent-1"): SessionNotification => ({
    sessionId: "native-session",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: id,
      title: "agent",
      kind: "other",
      status: "pending",
      rawInput: { description: "Explore layout", subagent_type: "explore", prompt: "Find it" },
    },
  });
  const progress = (text: string, id = "agent-1"): SessionNotification => ({
    sessionId: "native-session",
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      content: [{ type: "content", content: { type: "text", text } }],
    },
  });

  const completedProgress = (text: string, id = "agent-1"): SessionNotification => {
    const notification = progress(text, id);
    return {
      ...notification,
      update: { ...notification.update, status: "completed" } as SessionNotification["update"],
    };
  };

  /** Mirrors AcpStructuredSession: sources see raw updates before the transform. */
  function harness() {
    const state = createAcpMapperState("thread-1");
    const events: RuntimeEvent[] = [];
    const map = (notification: SessionNotification) => {
      events.push(...mapAcpSessionUpdate(normalizeCommandCodeSessionUpdate(notification), state));
    };
    const source = new CommandCodeSubagentSteps(map);
    const feed = (notification: SessionNotification) => {
      if (source.onSessionUpdate(notification) !== true) map(notification);
    };
    return { events, feed };
  }

  it("renders native tool summaries as child tool rows, not message text, and keeps the final response", () => {
    const { events, feed } = harness();
    feed(agentCall());
    feed(progress("read_directory(.)"));
    feed(progress("read_file(src\\ChatPane.tsx)"));

    const [parent, ...children] = events.filter((event) => event.type === "item.started");
    expect(parent).toMatchObject({ itemType: "tool_call", payload: { isSubAgent: true } });
    const parentItemId = parent?.itemId;
    expect(children).toEqual([
      expect.objectContaining({
        itemType: "tool_call",
        parentItemId,
        payload: expect.objectContaining({ title: "read_directory(.)", status: "success" }),
      }),
      expect.objectContaining({
        itemType: "tool_call",
        parentItemId,
        payload: expect.objectContaining({ title: "read_file(src\\ChatPane.tsx)" }),
      }),
    ]);
    expect(
      events.flatMap((event) => (event.type === "item.completed" ? [event.itemId] : [])),
    ).toEqual(children.map((child) => child.itemId));
    expect(events.some((event) => event.type === "content.delta")).toBe(false);
    const parentUpdates = events.filter(
      (event) => event.type === "item.updated" && event.itemId === parentItemId,
    );
    expect(parentUpdates.at(-1)).toMatchObject({
      payload: { progress: { lastToolName: "read_file", toolUses: 2, stepCount: 2 } },
    });

    const before = events.length;
    feed(completedProgress("The layout is in ChatPane.tsx."));
    const finalEvents = events.slice(before);
    expect(finalEvents.filter((event) => event.type === "content.delta")).toEqual([
      expect.objectContaining({ delta: "The layout is in ChatPane.tsx." }),
    ]);
    expect(finalEvents.at(-1)).toMatchObject({
      type: "item.completed",
      itemId: parentItemId,
      payload: { result: "The layout is in ChatPane.tsx.", status: "success" },
    });
  });

  it("isolates sibling steps and never reinterprets ordinary, unknown, or completed tool output", () => {
    const ingested: SessionNotification[] = [];
    const source = new CommandCodeSubagentSteps((notification) => {
      ingested.push(notification);
    });
    expect(source.onSessionUpdate(agentCall())).toBe(false);
    expect(source.onSessionUpdate(agentCall("agent-2"))).toBe(false);
    expect(source.onSessionUpdate(progress("glob(src/**)"))).toBe(true);
    expect(source.onSessionUpdate(progress("grep(foo)", "agent-2"))).toBe(true);
    expect(ingested.map((notification) => notification.update)).toEqual([
      expect.objectContaining({
        sessionUpdate: "tool_call",
        toolCallId: "agent-1:step:1",
        title: "glob(src/**)",
        status: "completed",
        _meta: { poracodeParentToolCallId: "agent-1" },
      }),
      expect.objectContaining({
        sessionUpdate: "tool_call_update",
        toolCallId: "agent-1",
        content: [],
        _meta: {
          poracodeSubAgentProgress: expect.objectContaining({ lastToolName: "glob", toolUses: 1 }),
        },
      }),
      expect.objectContaining({
        toolCallId: "agent-2:step:1",
        _meta: { poracodeParentToolCallId: "agent-2" },
      }),
      expect.objectContaining({
        toolCallId: "agent-2",
        _meta: {
          poracodeSubAgentProgress: expect.objectContaining({ lastToolName: "grep", toolUses: 1 }),
        },
      }),
    ]);

    ingested.length = 0;
    for (const notification of [
      progress("read_file(test)", "unknown"),
      progress("Ordinary intermediate prose"),
      { ...progress("read_file(test)"), sessionId: "another-session" },
    ]) {
      expect(source.onSessionUpdate(notification)).toBe(false);
    }
    source.onSessionUpdate(agentCall());
    expect(source.onSessionUpdate(completedProgress("read_file(test)"))).toBe(false);
    expect(source.onSessionUpdate(progress("read_file(test)"))).toBe(false);
    expect(ingested).toEqual([]);
    const independent = new CommandCodeSubagentSteps(() => {});
    expect(independent.onSessionUpdate(progress("read_file(test)"))).toBe(false);
  });
});
