import { beforeEach, describe, expect, it } from "vitest";
import { useComposerInputInbox } from "./composerInputInbox";

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
