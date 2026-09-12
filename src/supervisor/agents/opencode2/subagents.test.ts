import { describe, expect, it } from "vitest";
import type { V2Event } from "./clientTypes";
import {
  createOpenCode2MapperState,
  mapOpenCode2Event,
  setOpenCode2SessionId,
} from "./eventMapping";
import { OpenCode2Subagents } from "./subagents";

function event(type: string, data: Record<string, unknown>): V2Event {
  return { id: type, created: 1, type, data } as V2Event;
}

function fixture() {
  const root = createOpenCode2MapperState("thread");
  setOpenCode2SessionId(root, "parent");
  const children = new OpenCode2Subagents(root);
  const [started] = mapOpenCode2Event(
    event("session.tool.input.started", {
      sessionID: "parent",
      assistantMessageID: "message",
      id: "tool",
      name: "subagent",
    }),
    root,
  );
  if (started?.type !== "item.started") throw new Error("missing parent item");
  return { root, children, parentItemId: started.itemId, started };
}

describe("OpenCode 2 native child sessions", () => {
  it("renders subagent rows and buffers early child activity until native correlation arrives", () => {
    const { children, parentItemId, started } = fixture();
    expect(started.payload).toMatchObject({ name: "Agent", isSubAgent: true });
    const created = event("session.created", { sessionID: "child", parentID: "parent" });
    expect(children.accepts(created)).toBe(true);
    children.map(created);
    expect(children.owns("child")).toBe(true);
    expect(
      children.map(
        event("session.text.delta", {
          sessionID: "child",
          assistantMessageID: "child-message",
          ordinal: 0,
          delta: "Child output",
        }),
      ),
    ).toEqual([]);
    const flushed = children.map(
      event("session.tool.progress", {
        sessionID: "parent",
        assistantMessageID: "message",
        id: "tool",
        metadata: { sessionID: "child" },
      }),
    );
    expect(flushed).toContainEqual(expect.objectContaining({ type: "item.started", parentItemId }));
    expect(flushed).toContainEqual(
      expect.objectContaining({ type: "content.delta", delta: "Child output" }),
    );
    expect(
      children.accepts(
        event("session.created", { sessionID: "unrelated", parentID: "someone-else" }),
      ),
    ).toBe(false);
  });

  it("forwards child approvals without settling the parent execution", () => {
    const { children } = fixture();
    children.map(
      event("session.tool.progress", {
        sessionID: "parent",
        assistantMessageID: "message",
        id: "tool",
        metadata: { sessionID: "child" },
      }),
    );
    const approval = children.map(
      event("permission.asked", {
        sessionID: "child",
        id: "permission",
        action: "shell",
        resources: ["pwd"],
      }),
    );
    expect(approval).toContainEqual(
      expect.objectContaining({ type: "request.opened", requestId: "opencode2-perm-permission" }),
    );
    children.map(event("session.execution.started", { sessionID: "child" }));
    expect(children.map(event("session.execution.succeeded", { sessionID: "child" }))).toEqual([]);
  });

  it("closes child tool activity during parent teardown", () => {
    const { children } = fixture();
    children.map(
      event("session.tool.progress", {
        sessionID: "parent",
        assistantMessageID: "message",
        id: "tool",
        metadata: { sessionID: "child" },
      }),
    );
    children.map(
      event("session.tool.input.started", {
        sessionID: "child",
        assistantMessageID: "child-message",
        id: "read",
        name: "read",
      }),
    );
    expect(children.close()).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(children.owns("child")).toBe(false);
  });
});
