import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { PendingPickerAttachment } from "@/renderer/state/browserPanelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { materializePickerAttachment } from "./browserAttachmentActions";

const bridge = vi.hoisted(() => ({
  readLocalImageFile: vi.fn<() => Promise<Uint8Array>>(),
  saveClipboardImage: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

const attachment: PendingPickerAttachment = {
  attachmentPath: "C:\\capture.png",
  attachmentName: "capture.png",
  mimeType: "image/png",
  selector: "#submit",
  sourceUrl: "https://example.com",
};
const imageData = new Uint8Array([1, 2, 3]);

describe("materializePickerAttachment", () => {
  const saveClipboardImage =
    vi.fn<
      (
        desktopId: string,
        input: { threadId: string; data: Uint8Array; extension: string },
      ) => Promise<string>
    >();

  beforeEach(() => {
    vi.clearAllMocks();
    bridge.readLocalImageFile.mockResolvedValue(imageData);
    bridge.saveClipboardImage.mockResolvedValue("/remote/thread/capture.png");
    saveClipboardImage.mockResolvedValue("/remote/draft/capture.png");
    useRemoteServersStore.setState({ saveClipboardImage });
    useAppStore.setState((state) => ({ ...state, projects: [], threads: [] }));
  });

  it("keeps a local attachment on the client without loading its bytes", async () => {
    await expect(materializePickerAttachment("local-thread", attachment)).resolves.toBe(attachment);
    expect(bridge.readLocalImageFile).not.toHaveBeenCalled();
    expect(bridge.saveClipboardImage).not.toHaveBeenCalled();
  });

  it("loads and uploads bytes for an existing remote thread", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        {
          id: "remote:d1:thread:t1",
          remoteServerId: "d1",
          remoteId: "t1",
        } as Thread,
      ],
    }));

    const result = await materializePickerAttachment("remote:d1:thread:t1", attachment);

    expect(bridge.readLocalImageFile).toHaveBeenCalledWith({
      url: "poracode-local://local/C:/capture.png",
    });
    expect(bridge.saveClipboardImage).toHaveBeenCalledWith({
      threadId: "remote:d1:thread:t1",
      data: imageData,
      extension: "png",
    });
    expect(result).toEqual({ ...attachment, attachmentPath: "/remote/thread/capture.png" });
  });

  it("loads and uploads remote draft bytes to the project's draft directory", async () => {
    useAppStore.setState((state) => ({
      ...state,
      projects: [
        {
          id: "remote:d1:project:p1",
          remoteServerId: "d1",
          remoteId: "p1",
        } as Project,
      ],
    }));

    const result = await materializePickerAttachment("draft:remote:d1:project:p1", attachment);

    expect(bridge.readLocalImageFile).toHaveBeenCalledOnce();
    expect(saveClipboardImage).toHaveBeenCalledWith("d1", {
      threadId: "draft-p1",
      data: imageData,
      extension: "png",
    });
    expect(result).toEqual({ ...attachment, attachmentPath: "/remote/draft/capture.png" });
  });

  it("does not upload when a remote capture can no longer be read", async () => {
    useAppStore.setState((state) => ({
      ...state,
      threads: [
        {
          id: "remote:d1:thread:t1",
          remoteServerId: "d1",
          remoteId: "t1",
        } as Thread,
      ],
    }));
    bridge.readLocalImageFile.mockRejectedValueOnce(new Error("capture missing"));

    await expect(materializePickerAttachment("remote:d1:thread:t1", attachment)).rejects.toThrow(
      "capture missing",
    );
    expect(bridge.saveClipboardImage).not.toHaveBeenCalled();
  });
});
