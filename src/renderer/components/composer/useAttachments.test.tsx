// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttachments, type SaveClipboardImage } from "./useAttachments";

describe("useAttachments", () => {
  // jsdom does not implement object URLs.
  const createObjectURL = vi.fn<(source: File) => string>(() => "blob:app/pasted-1");
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

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

  it("previews pasted images from a local object URL and revokes it on removal", async () => {
    const saveImage = vi.fn<SaveClipboardImage>(async () =>
      Promise.resolve("C:\\Users\\host\\.poracode\\attachments\\draft\\image.png"),
    );
    const file = new File([new Uint8Array([1, 2, 3])], "clipboard.png", { type: "image/png" });
    const { result } = renderHook(() => useAttachments({ saveClipboardImage: saveImage }));

    await act(async () => {
      await result.current.addClipboardImage(file, "draft:remote-project");
    });

    const [attachment] = result.current.attachments;
    expect(attachment?.previewUrl).toBe("blob:app/pasted-1");
    expect(createObjectURL).toHaveBeenCalledWith(file);

    act(() => {
      result.current.removeAttachment(attachment!.id);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    expect(result.current.attachments).toEqual([]);
  });

  it("revokes pasted-image object URLs on clearAll", async () => {
    const saveImage = vi.fn<SaveClipboardImage>(async () => Promise.resolve("/tmp/image.png"));
    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const { result } = renderHook(() => useAttachments({ saveClipboardImage: saveImage }));

    await act(async () => {
      await result.current.addClipboardImage(file, "thread-1");
    });
    act(() => {
      result.current.clearAll();
    });

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    expect(result.current.attachments).toEqual([]);
  });
});
