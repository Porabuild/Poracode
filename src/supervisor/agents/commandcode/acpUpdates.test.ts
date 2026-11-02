import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import {
  createCommandCodeSessionUpdateTransform,
  normalizeCommandCodeSessionUpdate,
} from "./acpUpdates";

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

  it("keeps native tool summaries out of child message text and preserves the final response", () => {
    const transform = createCommandCodeSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    mapAcpSessionUpdate(transform(agentCall()), state);
    for (const [index, text] of ["read_directory(.)", "read_file(src\\ChatPane.tsx)"].entries()) {
      const events = mapAcpSessionUpdate(transform(progress(text)), state);
      expect(events).toEqual([
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({
            progress: expect.objectContaining({ description: text, toolUses: index + 1 }),
          }),
        }),
      ]);
      expect(events[0]).not.toHaveProperty("payload.result");
    }
    const final = progress("The layout is in ChatPane.tsx.");
    final.update = { ...final.update, status: "completed" } as SessionNotification["update"];
    const events = mapAcpSessionUpdate(transform(final), state);
    expect(events.filter((event) => event.type === "content.delta")).toEqual([
      expect.objectContaining({ delta: "The layout is in ChatPane.tsx." }),
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: { result: "The layout is in ChatPane.tsx.", status: "success" },
    });
  });

  it("isolates sibling counts and never reinterprets ordinary, unknown, or completed tool output", () => {
    const transform = createCommandCodeSessionUpdateTransform();
    transform(agentCall());
    transform(agentCall("agent-2"));
    const first = transform(progress("glob(src/**)"));
    const sibling = transform(progress("grep(foo)", "agent-2"));
    expect(first.update._meta).toMatchObject({ poracodeSubAgentProgress: { toolUses: 1 } });
    expect(sibling.update._meta).toMatchObject({ poracodeSubAgentProgress: { toolUses: 1 } });
    for (const notification of [
      progress("read_file(test)", "unknown"),
      progress("Ordinary intermediate prose"),
      { ...progress("read_file(test)"), sessionId: "another-session" },
    ]) {
      expect(transform(notification)).toBe(notification);
    }
    transform(agentCall());
    const completed = progress("read_file(test)");
    completed.update = {
      ...completed.update,
      status: "completed",
    } as SessionNotification["update"];
    expect(transform(completed)).toBe(completed);
    const late = progress("read_file(test)");
    expect(transform(late)).toBe(late);
    const independent = createCommandCodeSessionUpdateTransform();
    expect(independent(progress("read_file(test)"))).toEqual(progress("read_file(test)"));
  });
});
