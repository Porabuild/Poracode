import { describe, expect, it } from "vitest";
import {
  getRuntimeItemPayload,
  isVisibleRuntimeItem,
  type CheckpointRuntimeItem,
} from "./runtimeItemVisibility";

function assistant(payload: unknown, text = ""): CheckpointRuntimeItem {
  return {
    type: "assistant_message",
    state: "completed",
    payload,
    streams: { assistant_text: text },
  };
}

describe("isVisibleRuntimeItem", () => {
  it("tolerates a completed assistant payload without content instead of throwing", () => {
    // A malformed host or provider payload must not crash the whole chat.
    expect(() => isVisibleRuntimeItem(assistant({}))).not.toThrow();
    expect(isVisibleRuntimeItem(assistant({}))).toBe(false);
    expect(isVisibleRuntimeItem(assistant({}, "Done."))).toBe(true);
  });

  it("keeps a completed assistant row with inline media even without text", () => {
    expect(
      isVisibleRuntimeItem(
        assistant({ content: [{ kind: "image", url: "https://example.test/a.png" }] }),
      ),
    ).toBe(true);
  });

  it("reads a message payload without content as empty content", () => {
    expect(getRuntimeItemPayload(assistant({ replyForm: undefined }), "assistant_message")).toEqual(
      { replyForm: undefined, content: [] },
    );
    const intact = { content: [{ kind: "text", text: "ok" }] };
    expect(getRuntimeItemPayload(assistant(intact), "assistant_message")).toBe(intact);
    expect(getRuntimeItemPayload(assistant(undefined), "assistant_message")).toBeUndefined();
    // Stable per stored payload, so memoized readers keep their identity.
    const legacy = { prompt: "Continue" };
    const item = { ...assistant(legacy), type: "user_message" };
    expect(getRuntimeItemPayload(item, "user_message")).toBe(
      getRuntimeItemPayload(item, "user_message"),
    );
  });
});
