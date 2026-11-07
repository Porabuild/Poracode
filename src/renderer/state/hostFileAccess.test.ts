import "@/renderer/testUtils/clientDraftDatabase";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityHost } from "./entityHost";
import { resolveHostFileAccess } from "./hostFileAccess";
import {
  readClientDraftAsset,
  stageClientDraftAsset,
  isClientDraftAsset,
} from "./composerDrafts/clientDraftDatabase";
import { pickClientDraftFiles } from "@/renderer/utils/browserFilePicker";
vi.mock("@/renderer/utils/browserFilePicker", () => ({
  pickClientDraftFiles: vi.fn<() => Promise<string[] | null>>(),
}));
import { useRemoteServersStore } from "./remoteServersStore";

const hosts = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("./entityHost", () => ({ entityHost: () => hosts.current }));

function host(fields: Partial<EntityHost>): EntityHost {
  return { runsOnThisMachine: false, hostId: "host-id", ...fields } as EntityHost;
}

describe("resolveHostFileAccess", () => {
  const pickAndUploadFiles =
    vi.fn<(connectionKey: string, attachmentThreadId: string) => Promise<string[] | null>>();
  const saveClipboardImage =
    vi.fn<
      (
        connectionKey: string,
        input: { threadId: string; data: Uint8Array; extension: string },
      ) => Promise<string>
    >();

  beforeEach(() => {
    pickAndUploadFiles.mockReset().mockResolvedValue(["/host/attachments/a.txt"]);
    saveClipboardImage.mockReset().mockResolvedValue("/host/attachments/clip.png");
    useRemoteServersStore.setState({ pickAndUploadFiles, saveClipboardImage });
  });

  it.each([
    ["no host owns the row", undefined],
    ["the host runs on this machine", host({ kind: "managed", runsOnThisMachine: true })],
  ])("leaves native dialogs and local saves alone when %s", (_case, owner) => {
    hosts.current = owner;
    expect(resolveHostFileAccess({ id: "row" })).toEqual({});
  });

  it("keeps attachments on the client until submission", async () => {
    hosts.current = host({ kind: "paired", connectionKey: "d1", hostId: "t1" });
    const file = stageClientDraftAsset(new Blob(["picked file"], { type: "text/plain" }), "a.txt");
    await file.saved;
    vi.mocked(pickClientDraftFiles).mockResolvedValueOnce([file.path]);
    const access = resolveHostFileAccess({ id: "row" });
    expect(access.canShowProjectEntryInExplorer).toBe(false);
    await expect(access.pickFiles?.()).resolves.toEqual([file.path]);
    expect(pickAndUploadFiles).not.toHaveBeenCalled();
    const data = new Uint8Array([1, 2, 255]);
    const path = await access.saveClipboardImage!({
      threadId: "view-id",
      data,
      extension: "png",
    });
    expect(isClientDraftAsset(path)).toBe(true);
    const image = await readClientDraftAsset(path);
    expect(image.mimeType).toBe("image/png");
    expect(new Uint8Array(await image.blob.arrayBuffer())).toEqual(data);
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });
});
