// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storableAttachment, useAttachments, type SaveClipboardImage } from "./useAttachments";

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

  it("drops the ephemeral preview URL from stashed and restored attachments", async () => {
    const saveImage = vi.fn<SaveClipboardImage>(async () => Promise.resolve("/tmp/image.png"));
    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const { result } = renderHook(() => useAttachments({ saveClipboardImage: saveImage }));

    await act(async () => {
      await result.current.addClipboardImage(file, "thread-1");
    });
    const [attachment] = result.current.attachments;

    // A stashed copy (draft save) keeps every field but the object URL.
    expect(storableAttachment(attachment!)).toEqual({
      id: attachment!.id,
      path: "/tmp/image.png",
      name: "Image 1.png",
      mimeType: "image/png",
      isImage: true,
    });

    // A restore must not resurrect a preview URL its previous composer may
    // already have revoked — the image renders from the durable path instead.
    act(() => {
      result.current.restore([attachment!]);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    expect(result.current.attachments[0]?.previewUrl).toBeUndefined();
    expect(result.current.attachments[0]?.path).toBe("/tmp/image.png");
  });

  it("ignores a pasted image that finishes after attachments are cleared", async () => {
    let resolveSave: ((path: string) => void) | undefined;
    const saveImage = vi.fn<SaveClipboardImage>(
      () =>
        new Promise<string>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const { result } = renderHook(() => useAttachments({ saveClipboardImage: saveImage }));

    const pastePromise = result.current.addClipboardImage(file, "thread-1");
    await waitFor(() => expect(saveImage).toHaveBeenCalled());
    act(() => {
      result.current.clearAll();
    });
    await act(async () => {
      resolveSave?.("/tmp/image.png");
      await pastePromise;
    });

    expect(result.current.attachments).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes outstanding pasted-image object URLs on unmount", async () => {
    const saveImage = vi.fn<SaveClipboardImage>(async () => Promise.resolve("/tmp/image.png"));
    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const { result, unmount } = renderHook(() => useAttachments({ saveClipboardImage: saveImage }));

    await act(async () => {
      await result.current.addClipboardImage(file, "thread-1");
    });
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
  });
});
