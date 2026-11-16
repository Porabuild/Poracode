import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import {
  drainComposerInputsInto,
  useComposerInputInbox,
  type ComposerInputTarget,
} from "./composerInputInbox";

describe("composerInputInbox", () => {
  beforeEach(() => {
    useComposerInputInbox.setState({ itemsByComposer: {} });
  });

  it("queues rapid inputs in order and drains only the targeted composer", () => {
    const inbox = useComposerInputInbox.getState();
    inbox.enqueue("thread-1", [{ kind: "text", content: "first" }]);
    inbox.enqueue("thread-1", [{ kind: "text", content: "second" }]);
    inbox.enqueue("thread-2", [{ kind: "text", content: "other" }]);

    expect(useComposerInputInbox.getState().drain("thread-1")).toEqual([
      [{ kind: "text", content: "first" }],
      [{ kind: "text", content: "second" }],
    ]);
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toBeUndefined();
    expect(useComposerInputInbox.getState().drain("thread-2")).toEqual([
      [{ kind: "text", content: "other" }],
    ]);
  });
});

describe("drainComposerInputsInto", () => {
  function fakeTarget(existing: PromptSegment[] = []) {
    return {
      serializeSegments: () => existing,
      insertSegments: vi.fn<ComposerInputTarget["insertSegments"]>(),
    };
  }

  const separator: PromptSegment[] = [{ kind: "text", content: "\n\n" }];

  beforeEach(() => {
    useComposerInputInbox.setState({ itemsByComposer: {} });
  });

  it("drains each composer id in order, separators after existing content", () => {
    const inbox = useComposerInputInbox.getState();
    inbox.enqueue("fallback", [{ kind: "text", content: "one" }]);
    inbox.enqueue("fallback", [{ kind: "text", content: "two" }]);
    inbox.enqueue("thread-1", [{ kind: "text", content: "three" }]);
    inbox.enqueue("thread-2", [{ kind: "text", content: "other" }]);
    const target = fakeTarget([{ kind: "text", content: "draft" }]);

    drainComposerInputsInto(target, ["fallback", "thread-1"]);

    expect(target.insertSegments).toHaveBeenCalledTimes(3);
    expect(target.insertSegments.mock.calls).toEqual([
      [[...separator, { kind: "text", content: "one" }], { atEnd: true, focus: false }],
      [[...separator, { kind: "text", content: "two" }], { atEnd: true, focus: false }],
      [[...separator, { kind: "text", content: "three" }], { atEnd: true, focus: false }],
    ]);
    expect(useComposerInputInbox.getState().itemsByComposer["fallback"]).toBeUndefined();
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toBeUndefined();
    expect(useComposerInputInbox.getState().itemsByComposer["thread-2"]).toEqual([
      [{ kind: "text", content: "other" }],
    ]);
  });

  it("omits the separator only for the first insert into an empty composer", () => {
    const inbox = useComposerInputInbox.getState();
    inbox.enqueue("key", [{ kind: "text", content: "one" }]);
    inbox.enqueue("key", [{ kind: "text", content: "two" }]);
    const target = fakeTarget();

    drainComposerInputsInto(target, ["key"]);

    expect(target.insertSegments).toHaveBeenCalledTimes(2);
    expect(target.insertSegments.mock.calls).toEqual([
      [[{ kind: "text", content: "one" }], { atEnd: true, focus: false }],
      [[...separator, { kind: "text", content: "two" }], { atEnd: true, focus: false }],
    ]);
  });

  it("drains a repeated composer id only once", () => {
    const inbox = useComposerInputInbox.getState();
    inbox.enqueue("k", [{ kind: "text", content: "one" }]);
    const target = fakeTarget();

    drainComposerInputsInto(target, ["k", "k"]);

    expect(target.insertSegments).toHaveBeenCalledTimes(1);
  });
});
