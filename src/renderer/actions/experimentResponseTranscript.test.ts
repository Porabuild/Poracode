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
});
