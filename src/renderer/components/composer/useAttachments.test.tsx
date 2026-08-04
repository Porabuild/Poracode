// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAttachments, type SaveClipboardImage } from "./useAttachments";

describe("useAttachments", () => {
  it("uses the remote image saver for pasted images", async () => {
    const saveImage = vi.fn<SaveClipboardImage>(async () =>
      Promise.resolve("/Users/host/.poracode/attachments/draft/image.png"),
    );
    const file = new File([new Uint8Array([1, 2, 3])], "clipboard.png", {
      type: "image/png",
    });
    const { result } = renderHook(() => useAttachments({ saveClipboardImage: saveImage }));

    await act(async () => {
      await result.current.addClipboardImage(file, "draft:remote-project");
    });

    expect(saveImage).toHaveBeenCalledWith({
      data: new Uint8Array([1, 2, 3]),
      extension: "png",
      threadId: "draft:remote-project",
    });
    expect(result.current.toSegments()).toEqual([
      {
        kind: "attachment",
        path: "/Users/host/.poracode/attachments/draft/image.png",
        mimeType: "image/png",
      },
    ]);
  });
});
