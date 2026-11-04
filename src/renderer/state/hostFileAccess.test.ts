import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityHost } from "./entityHost";
import { resolveHostFileAccess } from "./hostFileAccess";
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
    expect(resolveHostFileAccess({ id: "row" }, "thread")).toEqual({});
  });

  it("uploads into a thread's attachment directory on another machine's host", async () => {
    hosts.current = host({ kind: "paired", connectionKey: "d1", hostId: "t1" });
    const access = resolveHostFileAccess({ id: "row" }, "thread");

    expect(access.canShowProjectEntryInExplorer).toBe(false);
    await expect(access.pickFiles?.()).resolves.toEqual(["/host/attachments/a.txt"]);
    expect(pickAndUploadFiles).toHaveBeenCalledWith("d1", "t1");
    const data = new Uint8Array([1]);
    await access.saveClipboardImage?.({ threadId: "view-id", data, extension: "png" });
    expect(saveClipboardImage).toHaveBeenCalledWith("d1", {
      threadId: "t1",
      data,
      extension: "png",
    });
  });

  it("uses the project's draft directory for a draft", async () => {
    hosts.current = host({ kind: "paired", connectionKey: "d1", hostId: "p1" });
    const access = resolveHostFileAccess({ id: "row" }, "draft");

    await access.pickFiles?.();
    expect(pickAndUploadFiles).toHaveBeenCalledWith("d1", "draft-p1");
  });
});
