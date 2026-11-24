import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventRouter } from "@/supervisor/runtime/threadSession/runtimeEventRouter";
import type { V2Event } from "./clientTypes";
import {
  createOpenCodeMapperState,
  mapOpenCodeEvent,
  readOpenCodeEventSessionID,
  setOpenCodeSessionId,
} from "./eventMapping";
import { OpenCodeSubagents } from "./subagents";
import { openCodeSnapshotEvents } from "./recovery";

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
  const root = createOpenCodeMapperState("thread");
  setOpenCodeSessionId(root, "parent");
  const children = new OpenCodeSubagents(root);
  const [started] = mapOpenCodeEvent(
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

/** The launch call's result: it returns at once while the child keeps working. */
function launchSucceeded(
  childID = "child",
  toolID = "tool",
  status?: string,
  messageID = "message",
) {
  return event("session.tool.success", {
    sessionID: "parent",
    assistantMessageID: messageID,
    id: toolID,
    content: [
      {
        type: "text",
        text: `The subagent is working in the background (sessionID: ${childID}).`,
      },
    ],
    metadata: { sessionID: childID, status },
  });
}

function childRead(childID = "child") {
  return event("session.tool.input.started", {
    sessionID: childID,
    assistantMessageID: "child-message",
    id: "read",
    name: "read",
  });
}

describe("OpenCode native child sessions", () => {
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
        payload: expect.objectContaining({
          status: "running",
          progress: { stepCount: 1, lastToolName: "read" },
        }),
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
        payload: expect.objectContaining({
          progress: { stepCount: 2, lastToolName: "read" },
        }),
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
    const [nextParent] = mapOpenCodeEvent(
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
        payload: expect.objectContaining({
          progress: { stepCount: 1, lastToolName: "read" },
        }),
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
        if (readOpenCodeEventSessionID(entry) === "parent") mapOpenCodeEvent(entry, root);
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
      for (const entry of openCodeSnapshotEvents("parent", [
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
          payload: expect.objectContaining({ progress: { stepCount: 3, lastToolName: "read" } }),
        }),
      );
    },
  );

  it("keeps a launch row running, with its metadata, while the child works", () => {
    const { children, parentItemId } = fixture();
    children.map(
      event("session.tool.progress", {
        sessionID: "parent",
        assistantMessageID: "message",
        id: "tool",
        metadata: { sessionID: "child", description: "Research" },
      }),
    );
    children.map(
      event("session.text.delta", {
        sessionID: "child",
        assistantMessageID: "child-message",
        ordinal: 0,
        delta: "Notes",
      }),
    );
    const launched = children.map(launchSucceeded());
    expect(launched).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );
    expect(launched).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "running",
          // Tells clients the host settles this row, so a copy read back from
          // storage is not mistaken for an orphan of a dead session.
          subAgentBackground: true,
          progress: { description: "Research", stepCount: 1 },
        }),
      }),
    );
    // No result yet: the call's text is addressed to the model, and whatever
    // interrupts the row later must be able to leave its own notice instead.
    const heldUpdate = launched.find((entry) => entry.type === "item.updated");
    expect(heldUpdate).toBeDefined();
    expect((heldUpdate as { payload?: Record<string, unknown> }).payload).not.toHaveProperty(
      "result",
    );
    const late = children.map(childRead());
    expect(late).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "running",
          progress: { description: "Research", stepCount: 2, lastToolName: "read" },
        }),
      }),
    );
    expect(
      late.some((entry) => entry.type === "turn.started" || entry.type === "turn.completed"),
    ).toBe(false);
  });

  it("completes a launch row with the child's report once its run succeeds", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    children.map(childRead());
    children.map(
      event("session.text.ended", {
        sessionID: "child",
        assistantMessageID: "child-report",
        ordinal: 0,
        text: "## Report\n\nShip it.",
      }),
    );
    const settled = children.map(event("session.execution.succeeded", { sessionID: "child" }));
    // The child's turn end also closes its own open rows; the launch row closes once.
    const launchRowEvents = settled.filter(
      (entry) => "itemId" in entry && entry.itemId === parentItemId,
    );
    expect(launchRowEvents).toHaveLength(1);
    expect(launchRowEvents[0]).toMatchObject({
      type: "item.completed",
      itemId: parentItemId,
      payload: {
        name: "Agent",
        isSubAgent: true,
        subAgentBackground: true,
        status: "success",
        subAgentStatus: "completed",
        result: "## Report\n\nShip it.",
        progress: { stepCount: 2, lastToolName: "read" },
      },
    });
    expect(settled.every((entry) => entry.type === "item.completed")).toBe(true);
    // The child's lifecycle owns nothing else, and a replay has nothing to settle.
    expect(children.map(event("session.execution.succeeded", { sessionID: "child" }))).toEqual([]);
  });

  it("completes a launch at once when its call already waited for the child", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    expect(children.map(launchSucceeded("child", "tool", "completed"))).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({ status: "success", isSubAgent: true }),
      }),
    );
    expect(children.map(event("session.execution.succeeded", { sessionID: "child" }))).toEqual([]);
  });

  it("completes a launch with the run's report when its child's run ended first", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(event("session.execution.started", { sessionID: "child" }));
    children.map(
      event("session.text.ended", {
        sessionID: "child",
        assistantMessageID: "child-report",
        ordinal: 0,
        text: "Report",
      }),
    );
    children.map(event("session.execution.succeeded", { sessionID: "child" }));
    const waited = children.map(launchSucceeded());
    expect(waited).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "success",
          subAgentStatus: "completed",
          result: "Report",
        }),
      }),
    );
    // Nothing is held for a call that waited, so the row carries no marker.
    const completions = waited
      .filter((entry) => entry.type === "item.completed")
      .map((entry) => entry.payload as Record<string, unknown>);
    expect(completions.some((payload) => payload.subAgentBackground === true)).toBe(false);
  });

  it("holds a continued launch again once the child's earlier run ended", () => {
    const { root, children } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    children.map(event("session.execution.succeeded", { sessionID: "child" }));
    const [nextParent] = mapOpenCodeEvent(
      event("session.tool.input.started", {
        sessionID: "parent",
        assistantMessageID: "next-message",
        id: "next-tool",
        name: "subagent",
      }),
      root,
    );
    if (nextParent?.type !== "item.started") throw new Error("missing continuation parent");
    children.map(linkEvent("child", "next-tool", "parent", "next-message"));
    expect(
      children.map(launchSucceeded("child", "next-tool", undefined, "next-message")),
    ).not.toContainEqual(expect.objectContaining({ type: "item.completed" }));
    expect(
      children.map(event("session.execution.succeeded", { sessionID: "child" })),
    ).toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: nextParent.itemId }),
    );
    expect(
      children.reconcile("child", { active: true, outcome: undefined, error: undefined }),
    ).toEqual([]);
  });

  it("keeps a launch row held when recovery finds no settled run behind it", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    // A launch can race a reconnect: the child exists, has not run yet and so
    // has no outcome. Settling here would drop the run the row still tracks.
    expect(
      children.reconcile("child", { active: false, outcome: undefined, error: undefined }),
    ).toEqual([]);
    expect(children.heldSessionIds()).toEqual(["child"]);
    expect(
      children.map(event("session.execution.succeeded", { sessionID: "child" })),
    ).toContainEqual(expect.objectContaining({ type: "item.completed", itemId: parentItemId }));
  });

  it("reports the server's own failure text for a run recovery finds failed", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    expect(
      children.reconcile("child", {
        active: false,
        outcome: "failed",
        error: "Rate limit reached",
      }),
    ).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "error",
          subAgentStatus: "failed",
          result: "Rate limit reached",
        }),
      }),
    );
    expect(children.heldSessionIds()).toEqual([]);
  });

  it.each([
    {
      name: "succeeded",
      terminal: () => event("session.execution.succeeded", { sessionID: "child" }),
      status: "success",
      subAgentStatus: "completed",
      result: "Report",
    },
    {
      name: "failed",
      terminal: () =>
        event("session.execution.failed", {
          sessionID: "child",
          error: { message: "Rate limit reached" },
        }),
      status: "error",
      subAgentStatus: "failed",
      result: "Rate limit reached",
    },
  ])("keeps a $name run's outcome when the launch's success is replayed", (row) => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    children.map(
      event("session.text.ended", {
        sessionID: "child",
        assistantMessageID: "child-report",
        ordinal: 0,
        text: "Report",
      }),
    );
    children.map(row.terminal());
    const replayed = children
      .map(launchSucceeded())
      .filter((entry) => "itemId" in entry && entry.itemId === parentItemId);
    expect(replayed).toEqual([
      expect.objectContaining({ type: "item.updated" }),
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({
          status: row.status,
          subAgentStatus: row.subAgentStatus,
          result: row.result,
        }),
      }),
    ]);
  });

  it("holds a launch whose child began another run before the call returned", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(event("session.execution.succeeded", { sessionID: "child" }));
    children.map(event("session.execution.started", { sessionID: "child" }));
    expect(children.map(launchSucceeded())).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );
  });

  it("joins the child's text parts into the launch row's result", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    for (const [ordinal, text] of [
      [0, "Intro"],
      [1, "Verdict"],
    ] as const)
      children.map(
        event("session.text.ended", {
          sessionID: "child",
          assistantMessageID: "child-report",
          ordinal,
          text,
        }),
      );
    expect(
      children.map(event("session.execution.succeeded", { sessionID: "child" })),
    ).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({ result: "Intro\n\nVerdict" }),
      }),
    );
  });

  it("leaves the launch text as the result when the child wrote nothing", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    expect(
      children
        .map(event("session.execution.succeeded", { sessionID: "child" }))
        .find((entry) => "itemId" in entry && entry.itemId === parentItemId),
    ).toMatchObject({
      type: "item.completed",
      payload: {
        subAgentStatus: "completed",
        result: "The subagent is working in the background (sessionID: child).",
      },
    });
  });

  it("completes a launch at once when the server names no child session", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    const unlinked = event("session.tool.success", {
      sessionID: "parent",
      assistantMessageID: "message",
      id: "tool",
      content: [{ type: "text", text: "Started." }],
    });
    expect(children.map(unlinked)).toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );
  });

  it("marks a failed child run on its launch row", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    const settled = children.map(
      event("session.execution.failed", {
        sessionID: "child",
        error: { type: "provider_error", message: "Rate limit reached" },
      }),
    );
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      type: "item.completed",
      itemId: parentItemId,
      payload: {
        status: "error",
        subAgentStatus: "failed",
        result: "Rate limit reached",
      },
    });
  });

  it("marks an interrupted child run as cancelled on its launch row", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    const settled = children.map(
      event("session.execution.interrupted", { sessionID: "child", reason: "user" }),
    );
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      type: "item.completed",
      itemId: parentItemId,
      payload: {
        status: "error",
        subAgentStatus: "cancelled",
        result: { error: "Interrupted: agent session ended before completion." },
      },
    });
  });

  it("closes a held launch row as cancelled, after its child rows, on teardown", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    children.map(childRead());
    const closed = children.close();
    const parent = closed.findIndex((entry) => "itemId" in entry && entry.itemId === parentItemId);
    expect(parent).toBeGreaterThan(0);
    expect(closed[parent]).toMatchObject({
      type: "item.completed",
      payload: { status: "error", subAgentStatus: "cancelled" },
    });
    expect(closed.slice(0, parent)).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(children.owns("child")).toBe(false);
  });

  it("settles a held launch row on recovery once the server no longer runs its child", () => {
    const { children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    children.map(
      event("session.text.ended", {
        sessionID: "child",
        assistantMessageID: "child-report",
        ordinal: 0,
        text: "Report",
      }),
    );
    expect(
      children.reconcile("child", { active: true, outcome: "succeeded", error: undefined }),
    ).toEqual([]);
    expect(
      children.reconcile("child", { active: false, outcome: "succeeded", error: undefined }),
    ).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "success",
          subAgentStatus: "completed",
          result: "Report",
        }),
      }),
    );
  });

  it.each([
    ["failed", "failed"],
    ["interrupted", "cancelled"],
  ] as const)("reports a child run found %s by recovery as %s", (outcome, subAgentStatus) => {
    const { children } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    expect(
      children.reconcile("child", { active: false, outcome, error: undefined }),
    ).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ status: "error", subAgentStatus }),
      }),
    );
  });

  it("finishes the earlier launch row when a follow-up continues the same child", () => {
    const { root, children, parentItemId } = fixture();
    children.map(linkEvent());
    children.map(launchSucceeded());
    children.map(
      event("session.text.ended", {
        sessionID: "child",
        assistantMessageID: "child-report",
        ordinal: 0,
        text: "First round",
      }),
    );
    const [nextParent] = mapOpenCodeEvent(
      event("session.tool.input.started", {
        sessionID: "parent",
        assistantMessageID: "next-message",
        id: "next-tool",
        name: "subagent",
      }),
      root,
    );
    if (nextParent?.type !== "item.started") throw new Error("missing continuation parent");
    children.map(linkEvent("child", "next-tool", "parent", "next-message"));
    const followedUp = children.map(
      launchSucceeded("child", "next-tool", undefined, "next-message"),
    );
    expect(followedUp).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "success",
          subAgentStatus: "completed",
          result: "First round",
        }),
      }),
    );
    expect(followedUp).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: nextParent.itemId }),
    );
    expect(
      children.map(event("session.execution.succeeded", { sessionID: "child" })),
    ).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: nextParent.itemId,
        payload: expect.objectContaining({ subAgentStatus: "completed", result: "First round" }),
      }),
    );
  });

  it("keeps a nested launch row open inside its parent's transcript", () => {
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
    if (nestedStart?.type !== "item.started") throw new Error("missing nested launch row");
    children.map(event("session.created", { sessionID: "grandchild", parentID: "child" }));
    children.map(linkEvent("grandchild", "nested-tool", "child", "child-message"));
    const launched = children.map(
      event("session.tool.success", {
        sessionID: "child",
        assistantMessageID: "child-message",
        id: "nested-tool",
        content: [{ type: "text", text: "working in the background" }],
        metadata: { sessionID: "grandchild", status: "running" },
      }),
    );
    expect(launched).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: nestedStart.itemId }),
    );
    const settled = children.map(event("session.execution.succeeded", { sessionID: "grandchild" }));
    expect(settled).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: nestedStart.itemId,
        payload: expect.objectContaining({ subAgentStatus: "completed" }),
      }),
    );
    expect(settled).not.toContainEqual(expect.objectContaining({ itemId: parentItemId }));
  });

  it("streams a held launch's child rows to an overlay opened before the launch returned", () => {
    const { children, parentItemId, started } = fixture();
    const published: RuntimeEvent[] = [];
    const router = new RuntimeEventRouter((entry) => {
      if (entry.type === "thread-runtime-events") published.push(...entry.events);
      else if (entry.type === "thread-runtime-event") published.push(entry.event);
    });
    const feed = (entry: V2Event) => {
      for (const runtime of children.map(entry)) router.append("thread", runtime);
      router.flush();
    };
    router.append("thread", started);
    router.flush();
    router.subscribe("thread", parentItemId);
    feed(linkEvent());
    feed(launchSucceeded());
    feed(childRead());
    expect(published).toContainEqual(
      expect.objectContaining({ type: "item.started", parentItemId, itemType: "tool_call" }),
    );
    router.unsubscribe("thread", parentItemId);
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
        payload: expect.objectContaining({ progress: { stepCount: 1, lastToolName: "read" } }),
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
      expect.objectContaining({ type: "request.opened", requestId: "opencode-perm-permission" }),
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
