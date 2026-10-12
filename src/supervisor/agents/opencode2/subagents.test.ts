import { describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventRouter } from "@/supervisor/runtime/threadSession/runtimeEventRouter";
import type { V2Event } from "./clientTypes";
import {
  createOpenCode2MapperState,
  mapOpenCode2Event,
  readOpenCode2EventSessionID,
  setOpenCode2SessionId,
} from "./eventMapping";
import { OpenCode2Subagents } from "./subagents";
import { openCode2SnapshotEvents } from "./recovery";

function event(type: string, data: Record<string, unknown>): V2Event {
  return { id: type, created: 1, type, data } as V2Event;
}

function linkEvent(
  childID = "child",
  toolID = "tool",
  sessionID = "parent",
  messageID = "message",
) {
  return event("session.tool.progress", {
    sessionID,
    assistantMessageID: messageID,
    id: toolID,
    metadata: { sessionID: childID },
  });
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
    expect(flushed).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({ progress: { stepCount: 1 } }),
      }),
    );
    expect(
      children.accepts(
        event("session.created", { sessionID: "unrelated", parentID: "someone-else" }),
      ),
    ).toBe(false);
  });

  it("publishes the parent count while an unopened child's transcript stays gated", () => {
    const { children, parentItemId, started } = fixture();
    const emit = vi.fn<(entry: SupervisorEvent) => void>();
    const router = new RuntimeEventRouter(emit);
    router.append("thread", started);
    router.flush();
    emit.mockClear();
    children.map(linkEvent());

    const toolStart = event("session.tool.input.started", {
      sessionID: "child",
      assistantMessageID: "child-message",
      id: "read",
      name: "read",
    });
    for (const entry of children.map(toolStart)) router.append("thread", entry);
    router.flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toEqual({
      type: "thread-runtime-event",
      threadId: "thread",
      event: expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({ status: "running", progress: { stepCount: 1 } }),
      }),
    });
    // Repeated start/recovery events and additional text chunks aren't new steps.
    expect(children.map(toolStart)).toEqual([]);
    emit.mockClear();
    for (const entry of children.map(
      event("session.reasoning.delta", {
        sessionID: "child",
        assistantMessageID: "child-message",
        ordinal: 0,
        delta: "Think",
      }),
    ))
      router.append("thread", entry);
    router.flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toEqual({
      type: "thread-runtime-event",
      threadId: "thread",
      event: expect.objectContaining({
        itemId: parentItemId,
        payload: expect.objectContaining({ progress: { stepCount: 2 } }),
      }),
    });
    expect(
      children.map(
        event("session.reasoning.delta", {
          sessionID: "child",
          assistantMessageID: "child-message",
          ordinal: 0,
          delta: " more",
        }),
      ),
    ).not.toContainEqual(expect.objectContaining({ type: "item.updated", itemId: parentItemId }));
    emit.mockClear();
    router.subscribe("thread", parentItemId);
    router.flush();
    expect(emit.mock.calls[0]?.[0]).toEqual({
      type: "thread-runtime-events",
      threadId: "thread",
      events: expect.arrayContaining([
        expect.objectContaining({ type: "item.started", parentItemId, itemType: "tool_call" }),
        expect.objectContaining({ type: "item.started", parentItemId, itemType: "reasoning" }),
      ]),
    });
  });

  it("does not count a replayed native operation twice", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    const activated = event("session.skill.activated", {
      sessionID: "child",
      name: "research",
      text: "Research instructions",
    });
    expect(children.map(activated)).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({ progress: { stepCount: 1 } }),
      }),
    );
    expect(children.map(activated)).not.toContainEqual(
      expect.objectContaining({ type: "item.updated", itemId: parentItemId }),
    );
  });

  it("starts a fresh parent count when continuing an existing child session", () => {
    const { root, children, parentItemId } = fixture();
    children.map(linkEvent());
    const activated = event("session.skill.activated", {
      sessionID: "child",
      name: "research",
      text: "Research instructions",
    });
    children.map(activated);
    const [nextParent] = mapOpenCode2Event(
      event("session.tool.input.started", {
        sessionID: "parent",
        assistantMessageID: "next-message",
        id: "next-tool",
        name: "subagent",
      }),
      root,
    );
    if (nextParent?.type !== "item.started") throw new Error("missing continuation parent");
    expect(children.map(linkEvent("child", "next-tool", "parent", "next-message"))).toEqual([]);
    // Replayed native operations from the earlier invocation don't belong to
    // the continuation's count even when they reannounce the same stable row.
    expect(children.map(activated)).not.toContainEqual(
      expect.objectContaining({ type: "item.updated", itemId: nextParent.itemId }),
    );
    const continued = children.map(
      event("session.tool.input.started", {
        sessionID: "child",
        assistantMessageID: "continued-message",
        id: "read",
        name: "read",
      }),
    );
    expect(continued).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: nextParent.itemId,
        payload: expect.objectContaining({ progress: { stepCount: 1 } }),
      }),
    );
    expect(continued).not.toContainEqual(
      expect.objectContaining({ type: "item.updated", itemId: parentItemId }),
    );
    expect(root.messages.get("message")?.tools.get("tool")?.progress.stepCount).toBe(1);
  });

  it.each([undefined, 0])(
    "keeps continuation progress when recovery relinks old tools with native count %s",
    (nativeCount) => {
      const { root, children } = fixture();
      const send = (entry: V2Event) => {
        if (readOpenCode2EventSessionID(entry) === "parent") mapOpenCode2Event(entry, root);
        return children.map(entry);
      };
      const start = (id: string) =>
        event("session.tool.input.started", {
          sessionID: "child",
          assistantMessageID: "child-message",
          id,
          name: "read",
        });
      send(linkEvent());
      send(start("old-read"));
      send(
        event("session.tool.success", {
          sessionID: "parent",
          assistantMessageID: "message",
          id: "tool",
          content: [{ type: "text", text: "Done" }],
          metadata: { sessionID: "child" },
        }),
      );
      send(
        event("session.tool.input.started", {
          sessionID: "parent",
          assistantMessageID: "message",
          id: "next-tool",
          name: "subagent",
        }),
      );
      send(linkEvent("child", "next-tool"));
      send(start("next-read"));
      send(start("another-read"));
      const nextParent = root.messages.get("message")!.tools.get("next-tool")!;
      expect(nextParent.progress.stepCount).toBe(2);

      const metadata = {
        sessionID: "child",
        ...(nativeCount === undefined ? {} : { stepCount: nativeCount }),
      };
      for (const entry of openCode2SnapshotEvents("parent", [
        {
          id: "message",
          type: "assistant",
          agent: "test",
          model: { providerID: "test", id: "test" },
          time: { created: 1 },
          content: [
            {
              type: "tool",
              id: "tool",
              name: "subagent",
              time: { created: 1 },
              state: {
                status: "completed",
                input: {},
                content: [{ type: "text", text: "Done" }],
                metadata,
              },
            },
            {
              type: "tool",
              id: "next-tool",
              name: "subagent",
              time: { created: 2 },
              state: { status: "running", input: {}, metadata },
            },
          ],
        },
      ]))
        send(entry);
      for (const id of ["old-read", "next-read", "another-read"]) send(start(id));
      expect(nextParent.progress.stepCount).toBe(2);
      expect(send(start("fresh-read"))).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: nextParent.itemId,
          payload: expect.objectContaining({ progress: { stepCount: 3 } }),
        }),
      );
    },
  );

  it("preserves parent metadata and completion when child progress arrives late", () => {
    const { root, children, parentItemId } = fixture();
    const link = event("session.tool.progress", {
      sessionID: "parent",
      assistantMessageID: "message",
      id: "tool",
      metadata: { sessionID: "child", description: "Research" },
    });
    mapOpenCode2Event(link, root);
    children.map(link);
    const first = event("session.text.delta", {
      sessionID: "child",
      assistantMessageID: "child-message",
      ordinal: 0,
      delta: "Notes",
    });
    children.map(first);
    const completed = event("session.tool.success", {
      sessionID: "parent",
      assistantMessageID: "message",
      id: "tool",
      content: [{ type: "text", text: "Done" }],
      metadata: { sessionID: "child", stepCount: 0 },
    });
    mapOpenCode2Event(completed, root);
    expect(children.map(completed)).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "success",
          result: "Done",
          progress: { description: "Research", stepCount: 1 },
        }),
      }),
    );
    const late = children.map(
      event("session.tool.input.started", {
        sessionID: "child",
        assistantMessageID: "child-message",
        id: "read",
        name: "read",
      }),
    );
    expect(late).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "success",
          progress: expect.objectContaining({ stepCount: 2 }),
        }),
      }),
    );
    expect(
      late.some((entry) => entry.type === "turn.started" || entry.type === "turn.completed"),
    ).toBe(false);
  });

  it("keeps nested child counts on their immediate parent tool", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    const nested = children.map(
      event("session.tool.input.started", {
        sessionID: "child",
        assistantMessageID: "child-message",
        id: "nested-tool",
        name: "subagent",
      }),
    );
    const nestedStart = nested.find((entry) => entry.type === "item.started");
    if (!nestedStart || nestedStart.type !== "item.started") throw new Error("missing nested item");
    children.map(linkEvent("grandchild", "nested-tool", "child", "child-message"));
    const progress = children.map(
      event("session.tool.input.started", {
        sessionID: "grandchild",
        assistantMessageID: "grandchild-message",
        id: "read",
        name: "read",
      }),
    );
    expect(progress).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: nestedStart.itemId,
        payload: expect.objectContaining({ progress: { stepCount: 1 } }),
      }),
    );
    expect(progress).not.toContainEqual(
      expect.objectContaining({ type: "item.updated", itemId: parentItemId }),
    );
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
