import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inlineImagePayloadRenders } from "@/shared/inlineImagePayload";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Codex 0.167 imageGeneration mapping", () => {
  it("maps fileId-backed imageGeneration items with savedPath into inline images and structured metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-codex-image-gen-"));
    const savedPath = join(dir, "generated.png");
    writeFileSync(savedPath, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));
    try {
      const state = createCodexMapperState("thread-1");
      const started = mapCodexNotification(
        "item/started",
        {
          threadId: "x",
          itemId: "img-gen-1",
          item: {
            id: "img-gen-1",
            type: "imageGeneration",
            status: "in_progress",
            revisedPrompt: null,
            failure: null,
            generationId: "gen-1",
            fileId: "file_abc123",
          },
        },
        state,
      );
      expect(started[0]).toMatchObject({
        type: "item.started",
        itemType: "image_view",
        payload: {
          name: "imageGeneration",
          args: { fileId: "file_abc123", generationId: "gen-1" },
          status: "running",
        },
      });

      const completed = mapCodexNotification(
        "item/completed",
        {
          threadId: "x",
          itemId: "img-gen-1",
          item: {
            id: "img-gen-1",
            type: "imageGeneration",
            status: "completed",
            revisedPrompt: "A crisp isometric icon",
            failure: null,
            generationId: "gen-1",
            fileId: "file_abc123",
            savedPath,
          },
        },
        state,
      );

      expect(completed).toEqual([
        expect.objectContaining({
          type: "item.completed",
          payload: {
            status: "success",
            args: {
              prompt: "A crisp isometric icon",
              path: savedPath,
              savedPath,
              fileId: "file_abc123",
              generationId: "gen-1",
            },
            result: {
              fileId: "file_abc123",
              savedPath,
              revisedPrompt: "A crisp isometric icon",
              generationId: "gen-1",
            },
            images: [`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`],
          },
        }),
      ]);

      const mergedPayload = {
        ...(started[0] as { payload: Record<string, unknown> }).payload,
        ...(completed[0] as { payload: Record<string, unknown> }).payload,
      };
      expect(inlineImagePayloadRenders(mergedPayload)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves fileId metadata when imageGeneration has neither inline result nor savedPath", () => {
    const state = createCodexMapperState("thread-1");
    const completed = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        item: {
          id: "img-gen-remote",
          type: "imageGeneration",
          status: "completed",
          revisedPrompt: "Sunset over mountains",
          failure: null,
          generationId: "gen-2",
          fileId: "file_remote999",
        },
      },
      state,
    );

    expect(completed.at(-1)).toMatchObject({
      type: "item.completed",
      payload: {
        status: "success",
        args: {
          prompt: "Sunset over mountains",
          fileId: "file_remote999",
          generationId: "gen-2",
        },
        result: {
          fileId: "file_remote999",
          revisedPrompt: "Sunset over mountains",
          generationId: "gen-2",
        },
      },
    });
  });

  it("marks imageGeneration items with failure or incomplete status as error", () => {
    const state = createCodexMapperState("thread-1");
    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        item: {
          id: "img-gen-failed",
          type: "imageGeneration",
          status: "incomplete",
          revisedPrompt: null,
          failure: {
            code: "moderation_blocked",
            message: "Blocked by safety system",
          },
          generationId: "gen-3",
          fileId: "file_blocked",
        },
      },
      state,
    );

    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: {
        status: "error",
        result: {
          fileId: "file_blocked",
          generationId: "gen-3",
          failure: {
            code: "moderation_blocked",
            message: "Blocked by safety system",
          },
        },
      },
    });
  });
});
