import { describe, expect, it } from "vitest";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { buildExperimentResponseTranscript } from "./experimentResponseTranscript";

describe("buildExperimentResponseTranscript", () => {
  it("keeps top-level user and assistant messages while excluding tool and sub-agent rows", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "user",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Research this" }] },
        streams: {},
      },
      {
        id: "tool",
        type: "web_search",
        state: "completed",
        payload: { query: "example" },
        streams: {},
      },
      {
        id: "child",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Hidden sub-agent output" }] },
        streams: {},
        parentItemId: "tool",
      },
      {
        id: "assistant",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Final answer" },
      },
    ];

    expect(buildExperimentResponseTranscript(items)).toBe(
      "User:\nResearch this\n\nAssistant:\nFinal answer",
    );
  });

  it("exports display text, not streamed text a display hook replaced or suppressed", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "rewritten",
        type: "assistant_message",
        state: "completed",
        payload: {
          content: [{ kind: "text", text: "Rewritten for display" }],
          displayAuthoritative: true,
        },
        streams: { assistant_text: "Original streamed text" },
      },
      {
        id: "suppressed",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "" }], displayAuthoritative: true },
        streams: { assistant_text: "Suppressed secret" },
      },
      {
        id: "suppressed-whitespace",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "\n" }], displayAuthoritative: true },
        streams: { assistant_text: "Also suppressed" },
      },
      {
        id: "interrupted",
        type: "assistant_message",
        state: "completed",
        // No authoritative flag: the stream stays the source of truth.
        payload: { content: [{ kind: "text", text: "Partial" }] },
        streams: { assistant_text: "Partial but complete stream" },
      },
    ];

    expect(buildExperimentResponseTranscript(items)).toBe(
      "Assistant:\nRewritten for display\n\nAssistant:\nPartial but complete stream",
    );
  });

  it("preserves visible assistant attachments alongside authoritative text", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "mixed",
        type: "assistant_message",
        state: "completed",
        payload: {
          content: [
            { kind: "text", text: "Rewritten for display" },
            {
              kind: "image",
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,eA==",
              name: "result.png",
            },
          ],
          displayAuthoritative: true,
        },
        streams: { assistant_text: "Original streamed text" },
      },
      {
        id: "image-only",
        type: "assistant_message",
        state: "completed",
        payload: {
          content: [
            { kind: "text", text: "" },
            {
              kind: "image",
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,eA==",
              name: "kept.png",
            },
          ],
          displayAuthoritative: true,
        },
        streams: { assistant_text: "Suppressed secret" },
      },
    ];

    expect(buildExperimentResponseTranscript(items)).toBe(
      "Assistant:\nRewritten for display\n[image: result.png]\n\nAssistant:\n[image: kept.png]",
    );
  });
});
