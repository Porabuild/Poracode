import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { transformQoderAcpSessionUpdate } from "./acpTransform";

function note(update: SessionNotification["update"]): SessionNotification {
  return { sessionId: "qoder-session", update };
}

describe("transformQoderAcpSessionUpdate", () => {
  it("marks Qoder's synthetic UpdateGoal edit as a canonical goal update", () => {
    const transformed = transformQoderAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "goal-tool",
        title: "Edit file",
        kind: "edit",
        status: "in_progress",
        rawInput: { status: "complete" },
        locations: [{ path: "file" }],
      } as SessionNotification["update"]),
    );
    expect((transformed.update as { rawInput: unknown }).rawInput).toEqual({
      status: "complete",
      _poracodeCanonicalGoal: { action: "updated", status: "complete" },
    });
  });

  it("leaves real edits and unrelated status-shaped tools untouched", () => {
    const realEdit = note({
      sessionUpdate: "tool_call",
      toolCallId: "real-edit",
      title: "Edit file",
      kind: "edit",
      status: "in_progress",
      rawInput: { status: "complete", path: "src/app.ts" },
      locations: [{ path: "src/app.ts" }],
    } as SessionNotification["update"]);
    expect(transformQoderAcpSessionUpdate(realEdit)).toBe(realEdit);
  });
});
