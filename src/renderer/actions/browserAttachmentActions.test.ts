import "@/renderer/testUtils/clientDraftDatabase";
import {
  readClientDraftAsset,
  isClientDraftAsset,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
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
  isRemoteSession: () => false,
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
    saveClipboardImage.mockImplementation(async (_desktopId, input) =>
      input.threadId.startsWith("draft-")
        ? "/remote/draft/capture.png"
        : "/remote/thread/capture.png",
    );
    useRemoteServersStore.setState({ saveClipboardImage });
    useAppStore.setState((state) => ({ ...state, projects: [], threads: [] }));
  });

  it("keeps a local attachment on the client without loading its bytes", async () => {
    await expect(materializePickerAttachment("local-thread", attachment)).resolves.toBe(attachment);
    expect(bridge.readLocalImageFile).not.toHaveBeenCalled();
    expect(bridge.saveClipboardImage).not.toHaveBeenCalled();
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it("keeps the path for a thread whose host shares this machine's filesystem", async () => {
    // The managed host reads the captured path directly, like a local thread.
    useAppStore.setState((state) => ({
      ...state,
      threads: [{ id: "managed-thread" } as Thread],
    }));
    await expect(materializePickerAttachment("managed-thread", attachment)).resolves.toBe(
      attachment,
    );
    expect(bridge.readLocalImageFile).not.toHaveBeenCalled();
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it("imports captured bytes on the client for an existing remote thread", async () => {
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
    expect(saveClipboardImage).not.toHaveBeenCalled();
    expect(bridge.saveClipboardImage).not.toHaveBeenCalled();
    expect(isClientDraftAsset(result.attachmentPath)).toBe(true);
    expect(
      new Uint8Array(await (await readClientDraftAsset(result.attachmentPath)).blob.arrayBuffer()),
    ).toEqual(imageData);
    expect({ ...result, attachmentPath: attachment.attachmentPath }).toEqual(attachment);
  });

  it("imports captured bytes independently of the remote draft environment", async () => {
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
    expect(saveClipboardImage).not.toHaveBeenCalled();
    expect(isClientDraftAsset(result.attachmentPath)).toBe(true);
    expect(
      new Uint8Array(await (await readClientDraftAsset(result.attachmentPath)).blob.arrayBuffer()),
    ).toEqual(imageData);
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
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });
});
