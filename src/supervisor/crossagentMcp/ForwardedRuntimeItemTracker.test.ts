import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { ForwardedRuntimeItemTracker } from "./ForwardedRuntimeItemTracker";

describe("forwarded item structural retention", () => {
  it("does not acquire non-status payload references on start or update", () => {
    const tracker = new ForwardedRuntimeItemTracker();
    const payload = vi.fn<() => { content: string }>(() => ({ content: "x".repeat(1024 * 1024) }));
    const started: Extract<RuntimeEvent, { type: "item.started" }> = {
      type: "item.started",
      threadId: "child",
      itemId: "answer",
      itemType: "assistant_message",
      get payload() {
        return payload();
      },
    };
    tracker.start(started);
    tracker.update({
      type: "item.updated",
      threadId: "child",
      itemId: "answer",
      get payload() {
        return payload();
      },
    });
    expect(payload).not.toHaveBeenCalled();
    expect(tracker.drainTerminalEvents("parent")).toEqual([
      { type: "item.completed", threadId: "parent", itemId: "answer" },
    ]);
  });

  it("preserves status payload merging and descendant-before-parent settlement", () => {
    const tracker = new ForwardedRuntimeItemTracker();
    tracker.start({
      type: "item.started",
      threadId: "child",
      itemId: "tool",
      itemType: "tool_call",
      payload: { title: "run fixture", status: "running", content: "retained tool output" },
    });
    tracker.start({
      type: "item.started",
      threadId: "child",
      itemId: "nested",
      itemType: "assistant_message",
      parentItemId: "tool",
      payload: { content: "not needed for completion" },
    });
    tracker.update({
      type: "item.updated",
      threadId: "child",
      itemId: "tool",
      payload: { summary: "latest" },
    });
    expect(tracker.drainTerminalEvents("parent")).toEqual([
      { type: "item.completed", threadId: "parent", itemId: "nested" },
      {
        type: "item.completed",
        threadId: "parent",
        itemId: "tool",
        payload: {
          title: "run fixture",
          status: "error",
          content: "retained tool output",
          summary: "latest",
        },
      },
    ]);
    expect(tracker.drainTerminalEvents("parent")).toEqual([]);
  });

  it("completed items release their payload and do not synthesize another completion", () => {
    const tracker = new ForwardedRuntimeItemTracker();
    tracker.start({
      type: "item.started",
      threadId: "child",
      itemId: "tool",
      itemType: "tool_call",
      payload: { content: "actual output" },
    });
    tracker.complete("tool");
    expect(tracker.drainTerminalEvents("parent")).toEqual([]);
  });
});

describe("forwarded descendant ordering", () => {
  it("preserves empty-id parent-walk behavior", () => {
    const tracker = new ForwardedRuntimeItemTracker();
    for (const [itemId, parentItemId] of [
      ["root", undefined],
      ["", "root"],
      ["leaf", ""],
    ]) {
      tracker.start({
        type: "item.started",
        threadId: "child",
        itemId: itemId!,
        itemType: "assistant_message",
        ...(parentItemId === undefined ? {} : { parentItemId }),
      });
    }
    expect(tracker.drainTerminalEvents("parent").map((x) => x.itemId)).toEqual([
      "",
      "root",
      "leaf",
    ]);
  });

  it("matches the released stable ordering across cyclic, missing and closed parents", () => {
    let seed = 71;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let trial = 0; trial < 80; trial += 1) {
      const tracker = new ForwardedRuntimeItemTracker();
      const graph = new Map<string, { itemId: string; parentItemId: string | undefined }>();
      for (let index = 0; index < 120; index += 1) {
        const itemId = `item-${index}`;
        const parentItemId = random() % 5 ? `item-${random() % 130}` : undefined;
        graph.set(itemId, { itemId, parentItemId });
        tracker.start({
          type: "item.started",
          threadId: "child",
          itemId,
          itemType: "assistant_message",
          ...(parentItemId ? { parentItemId } : {}),
        });
      }
      for (let index = 0; index < 20; index += 1) {
        const itemId = `item-${random() % 120}`;
        graph.delete(itemId);
        tracker.complete(itemId);
      }
      const depth = (item: { parentItemId: string | undefined }) => {
        let value = 0;
        let parentId = item.parentItemId;
        const seen = new Set<string>();
        while (parentId && graph.has(parentId) && !seen.has(parentId)) {
          seen.add(parentId);
          value += 1;
          parentId = graph.get(parentId)!.parentItemId;
        }
        return value;
      };
      const expected = [...graph.values()].sort((a, b) => depth(b) - depth(a)).map((x) => x.itemId);
      expect(tracker.drainTerminalEvents("parent").map((x) => x.itemId)).toEqual(expected);
    }
  });

  it("resolves a deep chain once without recursive stack growth", () => {
    const tracker = new ForwardedRuntimeItemTracker();
    const count = 10_000;
    for (let index = 0; index < count; index += 1) {
      tracker.start({
        type: "item.started",
        threadId: "child",
        itemId: `${index}`,
        itemType: "assistant_message",
        ...(index ? { parentItemId: `${index - 1}` } : {}),
      });
    }
    const result = tracker.drainTerminalEvents("parent");
    expect(result.map((x) => x.itemId)).toEqual(
      Array.from({ length: count }, (_, i) => `${count - 1 - i}`),
    );
    expect(tracker.drainTerminalEvents("parent")).toEqual([]);
  });
});
