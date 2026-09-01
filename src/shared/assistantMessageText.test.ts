import { describe, expect, it } from "vitest";
import {
  assistantDisplayText,
  authoritativeAssistantText,
  hasVisibleAssistantText,
  type AssistantTextSource,
} from "./assistantMessageText";

function item(partial: Partial<AssistantTextSource>): AssistantTextSource {
  return { state: "completed", streams: {}, ...partial };
}

describe("assistantDisplayText", () => {
  it("prefers the live stream while the item is in flight", () => {
    const source = item({
      state: "updated",
      payload: { content: [{ kind: "text", text: "Hello" }], displayAuthoritative: true },
      streams: { assistant_text: "Bonjour" },
    });
    expect(assistantDisplayText(source)).toBe("Bonjour");
  });

  it("swaps to an authoritative payload once completed", () => {
    const source = item({
      payload: { content: [{ kind: "text", text: "Hello" }], displayAuthoritative: true },
      streams: { assistant_text: "Bonjour" },
    });
    expect(assistantDisplayText(source)).toBe("Hello");
  });

  it("returns empty text for an authoritative suppressed payload", () => {
    const source = item({
      payload: { content: [{ kind: "text", text: "" }], displayAuthoritative: true },
      streams: { assistant_text: "Suppressed original" },
    });
    expect(assistantDisplayText(source)).toBe("");
    expect(hasVisibleAssistantText(source)).toBe(false);
  });

  it("collapses a whitespace-only authoritative payload to empty text", () => {
    // Suppression via "\n" instead of "" must read as empty everywhere, or
    // exports that bypass the visibility filter emit a vacuous entry for a
    // row the chat hides.
    const source = item({
      payload: { content: [{ kind: "text", text: "\n" }], displayAuthoritative: true },
      streams: { assistant_text: "Suppressed original" },
    });
    expect(assistantDisplayText(source)).toBe("");
    expect(hasVisibleAssistantText(source)).toBe(false);
  });

  it("keeps the full stream when a completed payload is not marked authoritative", () => {
    // Stream-first providers (e.g. Codex after an interrupted turn) complete
    // with a payload that can hold less text than what already streamed.
    const source = item({
      payload: { content: [{ kind: "text", text: "Partial" }] },
      streams: { assistant_text: "Partial plus the rest" },
    });
    expect(assistantDisplayText(source)).toBe("Partial plus the rest");
  });

  it("keeps the stream for items persisted before the flag existed", () => {
    // Regression fixture per .agents/docs/versioning.md: the previous
    // persisted shape has no `displayAuthoritative` key and must keep the
    // pre-flag stream-first behaviour.
    const oldShape = JSON.parse(
      JSON.stringify({
        state: "completed",
        payload: { content: [{ kind: "text", text: "old payload copy" }] },
        streams: { assistant_text: "old streamed text" },
      }),
    ) as AssistantTextSource;
    expect(assistantDisplayText(oldShape)).toBe("old streamed text");
  });

  it("falls back to payload text when there is no stream", () => {
    const source = item({
      payload: { content: [{ kind: "text", text: "payload answer" }] },
    });
    expect(assistantDisplayText(source)).toBe("payload answer");
    expect(hasVisibleAssistantText(source)).toBe(true);
  });

  it("joins multiple text blocks and drops blanked ones", () => {
    const source = item({
      payload: {
        content: [
          { kind: "text", text: "First display block" },
          { kind: "text", text: "" },
        ],
        displayAuthoritative: true,
      },
      streams: { assistant_text: "raw" },
    });
    expect(assistantDisplayText(source)).toBe("First display block");
  });

  it("returns empty for a completed item with no text anywhere", () => {
    const source = item({ payload: { content: [{ kind: "image", dataUrl: "d" }] } });
    expect(assistantDisplayText(source)).toBe("");
    expect(hasVisibleAssistantText(source)).toBe(false);
  });
});

describe("authoritativeAssistantText", () => {
  it("returns the display text only for flagged payloads", () => {
    expect(
      authoritativeAssistantText({
        content: [{ kind: "text", text: "Rewritten" }],
        displayAuthoritative: true,
      }),
    ).toBe("Rewritten");
    expect(authoritativeAssistantText({ content: [{ kind: "text", text: "Plain" }] })).toBeNull();
    expect(authoritativeAssistantText({ status: "running" })).toBeNull();
    expect(authoritativeAssistantText(undefined)).toBeNull();
  });

  it("collapses suppressed payloads to empty text", () => {
    expect(
      authoritativeAssistantText({
        content: [{ kind: "text", text: "" }],
        displayAuthoritative: true,
      }),
    ).toBe("");
    expect(
      authoritativeAssistantText({
        content: [{ kind: "text", text: "\n" }],
        displayAuthoritative: true,
      }),
    ).toBe("");
  });
});

describe("hasVisibleAssistantText", () => {
  it("ignores a whitespace-only unflagged payload when real text streamed", () => {
    const source = item({
      payload: { content: [{ kind: "text", text: "\n\n" }] },
      streams: { assistant_text: "real streamed answer" },
    });
    expect(hasVisibleAssistantText(source)).toBe(true);
    expect(assistantDisplayText(source)).toBe("real streamed answer");
  });

  it("treats a whitespace-only payload without a stream as invisible", () => {
    // Factory Droid persists "\n" stream-boundary chunks as assistant rows.
    const source = item({ payload: { content: [{ kind: "text", text: "\n" }] } });
    expect(hasVisibleAssistantText(source)).toBe(false);
  });

  it("treats whitespace-only streams as invisible", () => {
    expect(hasVisibleAssistantText(item({ streams: { assistant_text: "\n\n" } }))).toBe(false);
    expect(hasVisibleAssistantText(item({ streams: { assistant_text: "answer" } }))).toBe(true);
  });
});
