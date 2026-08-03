import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { PendingPickerAttachment } from "@/renderer/state/browserPanelStore";
import { materializePickerAttachment } from "./useElementPicker";

const bridge = vi.hoisted(() => ({
  saveClipboardImage: vi.fn<() => Promise<string>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

const attachment: PendingPickerAttachment = {
  attachmentPath: "C:\\capture.png",
  attachmentName: "capture.png",
  mimeType: "image/png",
  data: new Uint8Array([1, 2, 3]),
  selector: "#submit",
  sourceUrl: "https://example.com",
};

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
    bridge.saveClipboardImage.mockResolvedValue("/remote/thread/capture.png");
    saveClipboardImage.mockResolvedValue("/remote/draft/capture.png");
    useRemoteServersStore.setState({ saveClipboardImage });
    useAppStore.setState((state) => ({ ...state, projects: [], threads: [] }));
  });

  it("keeps a local attachment on the client and drops the transport bytes", async () => {
    const result = await materializePickerAttachment("local-thread", attachment);

    expect(result).toEqual({
      attachmentPath: "C:\\capture.png",
      attachmentName: "capture.png",
      mimeType: "image/png",
      selector: "#submit",
      sourceUrl: "https://example.com",
    });
    expect(bridge.saveClipboardImage).not.toHaveBeenCalled();
  });

  it("uploads an existing remote thread attachment through the central bridge", async () => {
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

    expect(bridge.saveClipboardImage).toHaveBeenCalledWith({
      threadId: "remote:d1:thread:t1",
      data: attachment.data,
      extension: "png",
    });
    expect(result.attachmentPath).toBe("/remote/thread/capture.png");
    expect(result.data).toBeUndefined();
  });

  it("uploads a remote draft attachment to the remote project's draft directory", async () => {
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

    expect(saveClipboardImage).toHaveBeenCalledWith("d1", {
      threadId: "draft-p1",
      data: attachment.data,
      extension: "png",
    });
    expect(result.attachmentPath).toBe("/remote/draft/capture.png");
    expect(result.data).toBeUndefined();
  });
});
