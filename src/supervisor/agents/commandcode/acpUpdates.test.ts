import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { normalizeCommandCodeSessionUpdate } from "./acpUpdates";

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
});
