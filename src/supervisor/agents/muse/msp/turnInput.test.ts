import { describe, expect, it } from "vitest";

import { buildMuseTurnInput } from "./turnInput";

describe("Muse MSP turn input", () => {
  it("emits a single text part carrying the prompt", async () => {
    await expect(buildMuseTurnInput("hello", undefined)).resolves.toEqual([
      { type: "text", text: "hello" },
    ]);
  });

  it("appends inline skill instructions after the prompt", async () => {
    await expect(buildMuseTurnInput("hello", "Follow the project instructions.")).resolves.toEqual([
      { type: "text", text: "hello\n\nFollow the project instructions." },
    ]);
  });

  it("never emits image parts — session routes reject media in retained history", async () => {
    // Attachment segments are handled upstream: the runtime localizes their
    // paths (readsImageAttachmentsFromHost: false) and the prompt formatter
    // embeds `@path` mentions in the prompt text, which the caller supplies.
    const parts = await buildMuseTurnInput(
      "can you read this image?\n\n@/home/user/.poracode/attachments/image.png",
      undefined,
    );
    expect(parts).toEqual([
      {
        type: "text",
        text: "can you read this image?\n\n@/home/user/.poracode/attachments/image.png",
      },
    ]);
    expect(parts.some((part) => part["type"] === "image")).toBe(false);
  });
});
