import { describe, expect, it } from "vitest";
import {
  editQueuedThreadFollowUpPayloadSchema,
  sendThreadInputPayloadSchema,
  setPendingSteerPayloadSchema,
} from "./thread";

const attachment = { kind: "attachment" as const, path: "C:\\shots\\one.png" };

describe("sendable input payloads", () => {
  it("accepts an attachment with no text and rejects an empty send", () => {
    const base = { threadId: "t1", config: { model: "gpt-5.5" } };
    expect(
      sendThreadInputPayloadSchema.safeParse({ ...base, prompt: "", segments: [attachment] })
        .success,
    ).toBe(true);
    expect(sendThreadInputPayloadSchema.safeParse({ ...base, prompt: "hi" }).success).toBe(true);
    expect(sendThreadInputPayloadSchema.safeParse({ ...base, prompt: "" }).success).toBe(false);
    expect(
      sendThreadInputPayloadSchema.safeParse({
        ...base,
        prompt: "",
        segments: [{ kind: "text", content: "" }],
      }).success,
    ).toBe(false);
  });

  it("applies the same rule to steers and queued follow-up edits", () => {
    expect(
      setPendingSteerPayloadSchema.safeParse({
        threadId: "t1",
        config: { model: "gpt-5.5" },
        prompt: "",
        segments: [attachment],
      }).success,
    ).toBe(true);
    expect(
      editQueuedThreadFollowUpPayloadSchema.safeParse({
        threadId: "t1",
        id: "e1",
        prompt: "",
        segments: [attachment],
      }).success,
    ).toBe(true);
    expect(
      editQueuedThreadFollowUpPayloadSchema.safeParse({ threadId: "t1", id: "e1", prompt: "" })
        .success,
    ).toBe(false);
  });
});
