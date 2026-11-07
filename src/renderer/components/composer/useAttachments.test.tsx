// @vitest-environment jsdom
import "@/renderer/testUtils/clientDraftDatabase";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readClientDraftAsset,
  isClientDraftAsset,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { storableAttachment, storableAttachments, useAttachments } from "./useAttachments";

const bridge = vi.hoisted(() => ({
  saveClipboardImage: vi.fn<() => Promise<string>>(),
  readClientDraftFile: undefined as undefined | ((input: { url: string }) => Promise<Uint8Array>),
}));
vi.mock("@/renderer/bridge", () => ({ isRemoteSession: () => false, readBridge: () => bridge }));

function pendingFile() {
  const bytes = new Uint8Array([1, 2, 3]);
  const file = new File([bytes], "clipboard.png", { type: "image/png" });
  let finish!: (data: ArrayBuffer) => void;
  const read = vi.spyOn(file, "arrayBuffer").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return { file, read, finish: () => finish(bytes.buffer), bytes };
}

describe("client-owned composer attachments", () => {
  const createObjectURL = vi.fn<(source: Blob) => string>(() => "blob:app/pasted-1");
  const revokeObjectURL = vi.fn<(url: string) => void>();
  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    bridge.saveClipboardImage.mockClear();
    bridge.readClientDraftFile = undefined;
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });
  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("exposes selected file references before React commits the update", () => {
    const { result } = renderHook(() => useAttachments());
    const read = result.current.getAttachments;
    const segments = result.current.toSegments;
    act(() => {
      result.current.addFiles(["C:\\first.txt"]);
      result.current.addFiles(["C:\\second.txt"]);
      expect(read().map((a) => a.path)).toEqual(["C:\\first.txt", "C:\\second.txt"]);
      expect(segments()).toEqual([
        { kind: "attachment", path: "C:\\first.txt", mimeType: "text/plain" },
        { kind: "attachment", path: "C:\\second.txt", mimeType: "text/plain" },
      ]);
    });
    expect(result.current.attachments).toHaveLength(2);
  });

  it("keeps a stable draft reference while waiting for the device write", async () => {
    const pending = pendingFile();
    const { result } = renderHook(() => useAttachments());
    let paste!: Promise<void>;
    act(() => {
      paste = result.current.addClipboardImage(pending.file);
    });
    await waitFor(() => expect(pending.read).toHaveBeenCalledOnce());
    const path = result.current.getDraftAttachments()[0]!.path;
    expect(isClientDraftAsset(path)).toBe(true);
    expect(result.current.getAttachments()).toEqual([]);
    const ready = vi.fn<() => void>();
    const waiting = paste.then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    await act(async () => {
      pending.finish();
      await paste;
      await waiting;
    });
    expect(ready).toHaveBeenCalledOnce();
    expect(result.current.getAttachments()[0]?.path).toBe(path);
  });

  it("stores exact pasted bytes on the client regardless of the selected host", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = new File([bytes], "clipboard.png", { type: "image/png" });
    const { result } = renderHook(() =>
      useAttachments({ source: { remoteServerId: "target-host" } }),
    );
    await act(async () => {
      await result.current.addClipboardImage(file);
    });
    const path = result.current.attachments[0]!.path;
    const saved = await readClientDraftAsset(path);
    expect(new Uint8Array(await saved.blob.arrayBuffer())).toEqual(bytes);
    expect(saved.mimeType).toBe("image/png");
    expect(result.current.toSegments()).toEqual([
      { kind: "attachment", path, mimeType: "image/png" },
    ]);
    expect(bridge.saveClipboardImage).not.toHaveBeenCalled();
  });

  it.each(["remove", "clear", "restore"] as const)(
    "removes pending attachments and ignores their late import after %s",
    async (action) => {
      const pending = pendingFile();
      const { result } = renderHook(() => useAttachments());
      let paste!: Promise<void>;
      act(() => {
        paste = result.current.addClipboardImage(pending.file);
      });
      await waitFor(() => expect(pending.read).toHaveBeenCalledOnce());
      expect(result.current.hasPendingUploads()).toBe(true);
      act(() => {
        if (action === "remove") result.current.removeAttachment(result.current.attachments[0]!.id);
        else if (action === "clear") result.current.clearAll();
        else result.current.restore([]);
      });
      expect(result.current.hasPendingUploads()).toBe(false);
      expect(result.current.attachments).toEqual([]);
      await act(async () => {
        pending.finish();
        await paste;
      });
      expect(result.current.attachments).toEqual([]);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    },
  );

  it("releases the preview and ignores late imports when the composer unmounts", async () => {
    const pending = pendingFile();
    const onDraftChange = vi.fn<() => void>();
    const { result, unmount } = renderHook(() => useAttachments({ onDraftChange }));
    let paste!: Promise<void>;
    act(() => {
      paste = result.current.addClipboardImage(pending.file);
    });
    await waitFor(() => expect(pending.read).toHaveBeenCalledOnce());
    unmount();
    onDraftChange.mockClear();
    await act(async () => {
      pending.finish();
      await paste;
    });
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("owns the pasted preview until removal", async () => {
    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addClipboardImage(file);
    });
    const attachment = result.current.attachments[0]!;
    expect(attachment.previewUrl).toBe("blob:app/pasted-1");
    expect(createObjectURL).toHaveBeenCalledWith(file);
    act(() => result.current.removeAttachment(attachment.id));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    expect(result.current.attachments).toEqual([]);
  });

  it("swaps restored attachment sets while keeping unrelated files", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addClipboardImage(
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
    });
    act(() => result.current.addFiles(["/tmp/notes.txt"]));
    const [pasted, kept] = result.current.attachments;
    const incoming = { id: "draft-b", path: "/tmp/b.png", name: "b.png", isImage: true };
    act(() => result.current.swap([pasted!], [incoming]));
    expect(result.current.attachments).toEqual([kept, incoming]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    act(() => result.current.swap([incoming], [pasted!]));
    expect(result.current.getDraftAttachments()).toEqual([kept, storableAttachment(pasted!)]);
  });

  it("releases every pasted preview on clearAll", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addClipboardImage(
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
    });
    act(() => result.current.clearAll());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    expect(result.current.attachments).toEqual([]);
  });

  it("restores a fresh object URL from saved client bytes", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addClipboardImage(
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
    });
    const attachment = result.current.attachments[0]!;
    const saved = storableAttachment(attachment);
    expect(saved).not.toHaveProperty("previewUrl");
    expect(isClientDraftAsset(saved.path)).toBe(true);
    act(() => result.current.restore([attachment]));
    expect(result.current.attachments[0]?.previewUrl).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(2));
    expect(result.current.attachments[0]?.path).toBe(saved.path);
  });

  it("does not reattach an import that finishes after clearAll", async () => {
    const pending = pendingFile();
    const { result } = renderHook(() => useAttachments());
    let paste!: Promise<void>;
    act(() => {
      paste = result.current.addClipboardImage(pending.file);
    });
    await waitFor(() => expect(pending.read).toHaveBeenCalledOnce());
    act(() => result.current.clearAll());
    await act(async () => {
      pending.finish();
      await paste;
    });
    expect(result.current.attachments).toEqual([]);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
  });

  it("paints immediately and checkpoints the reserved path while byte import is pending", async () => {
    const pending = pendingFile();
    const { result } = renderHook(() => useAttachments());
    let paste!: Promise<void>;
    act(() => {
      paste = result.current.addClipboardImage(pending.file);
    });
    expect(result.current.attachments[0]?.previewUrl).toBe("blob:app/pasted-1");
    expect(result.current.hasPendingUploads()).toBe(true);
    expect(result.current.isUploading).toBe(true);
    expect(result.current.toSegments()).toEqual([]);
    const [saved] = storableAttachments(result.current.attachments);
    expect(isClientDraftAsset(saved!.path)).toBe(true);
    expect(saved).not.toHaveProperty("previewUrl");
    await waitFor(() => expect(pending.read).toHaveBeenCalledOnce());
    await act(async () => {
      pending.finish();
      await paste;
    });
    expect(result.current.hasPendingUploads()).toBe(false);
    expect(result.current.toSegments()[0]).toMatchObject({ kind: "attachment", path: saved!.path });
  });

  it("retains a failed device write and its preview for retry or explicit removal", async () => {
    const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    vi.spyOn(file, "arrayBuffer").mockRejectedValueOnce(new Error("device write refused"));
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await expect(result.current.addClipboardImage(file)).rejects.toThrow(
        "Couldn't save this draft",
      );
    });
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]?.previewUrl).toBe("blob:app/pasted-1");
    expect(result.current.hasPendingUploads()).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => result.current.removeAttachment(result.current.attachments[0]!.id));
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("releases outstanding previews on unmount", async () => {
    const { result, unmount } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addClipboardImage(
        new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" }),
      );
    });
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/pasted-1");
  });

  it("replaces the temporary native preview with the imported image bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const read = vi.fn<(input: { url: string }) => Promise<Uint8Array>>().mockResolvedValue(bytes);
    bridge.readClientDraftFile = read;
    const create = vi.fn<(blob: Blob) => string>(() => "blob:native-import");
    const revoke = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const { result, unmount } = renderHook(() => useAttachments());
    act(() => result.current.addFiles(["/tmp/picked.png"]));
    await waitFor(() => expect(result.current.isUploading).toBe(false));
    expect(isClientDraftAsset(result.current.attachments[0]!.path)).toBe(true);
    expect(result.current.attachments[0]?.previewUrl).toBe("blob:native-import");
    expect(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())).toEqual(bytes);
    expect(read).toHaveBeenCalledWith({ url: "poracode-local://local/tmp/picked.png" });
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:native-import");
    bridge.readClientDraftFile = undefined;
  });

  it("does not allocate an image preview URL for an imported non-image file", async () => {
    bridge.readClientDraftFile = vi
      .fn<() => Promise<Uint8Array>>()
      .mockResolvedValue(new Uint8Array([1]));
    const create = vi.fn<(blob: Blob) => string>(() => "blob:unused");
    Object.assign(URL, {
      createObjectURL: create,
      revokeObjectURL: vi.fn<(url: string) => void>(),
    });
    const { result, unmount } = renderHook(() => useAttachments());
    act(() => result.current.addFiles(["/tmp/notes.txt"]));
    await waitFor(() => expect(result.current.isUploading).toBe(false));
    expect(create).not.toHaveBeenCalled();
    expect(result.current.getDraftAttachments()).toHaveLength(1);
    unmount();
    bridge.readClientDraftFile = undefined;
  });
});
