import { afterEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { MediaSource } from "@/shared/remote/media";
import type { RemoteDesktopClient } from "@/shared/remote/client";

const { withClient, bridgeClient, managedState, bridgeHandle, capabilities } = vi.hoisted(() => ({
  withClient:
    vi.fn<(id: string, run: (client: unknown) => unknown) => ReturnType<(c: unknown) => unknown>>(),
  bridgeClient: { current: null as unknown },
  managedState: { current: { status: "idle" } as unknown },
  bridgeHandle: { openExternal: vi.fn<(url: string) => Promise<void>>(async () => {}) },
  capabilities: { nativeShell: false },
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => ({ withClient }) },
}));
vi.mock("@/renderer/browser/remoteBridge", () => ({
  getRemoteBridgeClient: () => bridgeClient.current,
}));
vi.mock("@/renderer/state/remoteServers/managedLoopbackOwner", () => ({
  getManagedParentAuthorityState: () => managedState.current,
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeHandle }));
vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: (capability: string) =>
    capabilities[capability as keyof typeof capabilities] === true,
}));

import { chatFileMediaRequest, downloadChatFile } from "./fileMediaSource";

const posix = { kind: "posix", path: "/repo" } satisfies ProjectLocation;
const windows = { kind: "windows", path: "C:\\repo" } satisfies ProjectLocation;
const wsl = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/u/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\u\\repo",
} satisfies ProjectLocation;

function client(source: Partial<MediaSource> = {}) {
  return {
    createMediaSource: vi.fn<(f: unknown, s?: AbortSignal) => Promise<MediaSource>>(async () => ({
      ticket: "pc_media_t",
      url: "https://host/api/files/media?ticket=pc_media_t",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      sizeBytes: 10,
      modifiedAtMs: 1,
      contentType: "application/octet-stream",
      ...source,
    })),
    releaseMediaSource: vi.fn<(t: string) => Promise<void>>(async () => {}),
  } as unknown as RemoteDesktopClient & {
    createMediaSource: MockedFunction<RemoteDesktopClient["createMediaSource"]>;
    releaseMediaSource: MockedFunction<RemoteDesktopClient["releaseMediaSource"]>;
  };
}

describe("chatFileMediaRequest", () => {
  it("keeps project-relative paths contained", () => {
    expect(chatFileMediaRequest(posix, "dist/a.zip")).toEqual({
      access: "project",
      projectLocation: { kind: "posix", path: "/repo" },
      path: "dist/a.zip",
    });
    expect(chatFileMediaRequest(posix, "./dist/a.zip")).toMatchObject({ path: "dist/a.zip" });
    expect(chatFileMediaRequest(posix, "dist\\a.zip")).toMatchObject({ path: "dist/a.zip" });
  });

  it("refuses relative traversal outright", () => {
    expect(() => chatFileMediaRequest(posix, "../a.zip")).toThrow(/outside the project/);
    expect(() => chatFileMediaRequest(posix, "dist/../a.zip")).toThrow(/outside the project/);
    expect(() => chatFileMediaRequest(posix, "..\\a.zip")).toThrow(/outside the project/);
  });

  it("detects POSIX roots case-sensitively", () => {
    expect(chatFileMediaRequest(posix, "/repo/dist/a.zip")).toMatchObject({
      access: "project",
      path: "dist/a.zip",
    });
    expect(chatFileMediaRequest(posix, "/Repo/dist/a.zip")).toMatchObject({
      access: "external",
      path: "/Repo/dist/a.zip",
    });
  });

  it("detects Windows roots case-insensitively and keeps UNC outside", () => {
    expect(chatFileMediaRequest(windows, "c:\\RePo\\dist\\a.zip")).toMatchObject({
      access: "project",
      path: "dist/a.zip",
    });
    expect(chatFileMediaRequest(windows, "D:\\other\\a.zip")).toMatchObject({
      access: "external",
      path: "D:\\other\\a.zip",
    });
    expect(chatFileMediaRequest(windows, "\\\\nas\\share\\a.zip")).toMatchObject({
      access: "external",
    });
  });

  it("detects WSL roots by linuxPath and UNC alias", () => {
    expect(chatFileMediaRequest(wsl, "/home/u/repo/dist/a.zip")).toMatchObject({
      access: "project",
      path: "dist/a.zip",
    });
    expect(
      chatFileMediaRequest(wsl, "\\\\wsl.localhost\\Ubuntu\\home\\u\\repo\\dist\\a.zip"),
    ).toMatchObject({ access: "project", path: "dist/a.zip" });
    expect(chatFileMediaRequest(wsl, "/home/u/other/a.zip")).toMatchObject({
      access: "external",
      path: "/home/u/other/a.zip",
    });
  });

  it("contains absolute descendants of a POSIX / root", () => {
    expect(
      chatFileMediaRequest({ kind: "posix", path: "/", remoteServerId: "h" }, "/repo/a.zip"),
    ).toEqual({
      access: "project",
      projectLocation: { kind: "posix", path: "/" },
      path: "repo/a.zip",
    });
    // A UNC share is not a descendant of the POSIX root.
    expect(
      chatFileMediaRequest({ kind: "posix", path: "/", remoteServerId: "h" }, "//nas/share/a.zip"),
    ).toMatchObject({ access: "external", path: "//nas/share/a.zip" });
  });

  it("keeps WSL UNC comparisons case-sensitive for Linux content", () => {
    const wslHost = {
      ...wsl,
      remoteServerId: "h",
      linuxPath: "/home/u/Repo",
      uncPath: "//wsl.localhost/Ubuntu/home/u/Repo",
    };
    // Differing Linux case is NOT contained (Linux dirs are case-sensitive).
    expect(chatFileMediaRequest(wslHost, "//wsl.localhost/Ubuntu/home/u/repo/a.zip")).toMatchObject(
      {
        access: "external",
      },
    );
    expect(chatFileMediaRequest(wslHost, "//wsl.localhost/Ubuntu/home/u/Repo/a.zip")).toMatchObject(
      {
        access: "project",
        path: "a.zip",
      },
    );
    expect(chatFileMediaRequest(wslHost, "/home/u/repo/a.zip")).toMatchObject({
      access: "external",
    });
    expect(chatFileMediaRequest(wslHost, "/home/u/Repo/a.zip")).toMatchObject({
      access: "project",
      path: "a.zip",
    });
  });

  it("rejects dot-segment escapes without lexical collapse or promotion", () => {
    expect(() => chatFileMediaRequest(posix, "/repo/sub/../a.zip")).toThrow(/outside the project/);
    expect(() => chatFileMediaRequest(posix, "/repo/../outside/a.zip")).toThrow(
      /outside the project/,
    );
  });

  it("strips remoteServerId from the wire payload", () => {
    const remote: ProjectLocation = { ...posix, remoteServerId: "host-1" };
    expect(chatFileMediaRequest(remote, "a.zip").projectLocation).toEqual({
      kind: "posix",
      path: "/repo",
    });
  });
});

describe("downloadChatFile", () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  afterEach(() => {
    click.mockClear();
    withClient.mockReset();
    bridgeHandle.openExternal.mockReset().mockResolvedValue(undefined);
    capabilities.nativeShell = false;
    bridgeClient.current = null;
    managedState.current = { status: "idle" };
  });

  it("uses the paired remote client and hands the ticket URL to an anchor download", async () => {
    const remote = client();
    withClient.mockImplementation((_id, run) => run(remote));
    const location: ProjectLocation = { ...posix, remoteServerId: "host-9" };
    await downloadChatFile(location, "/repo/dist/release.zip", new AbortController().signal);
    expect(withClient).toHaveBeenCalledWith("host-9", expect.any(Function));
    expect(remote.createMediaSource).toHaveBeenCalledWith(
      {
        access: "project",
        projectLocation: { kind: "posix", path: "/repo" },
        path: "dist/release.zip",
        disposition: "attachment",
      },
      expect.any(AbortSignal),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(remote.releaseMediaSource).not.toHaveBeenCalled();
  });

  it("falls to the local bridge client only for local locations", async () => {
    const bridge = client();
    bridgeClient.current = bridge;
    await downloadChatFile(posix, "a.zip", new AbortController().signal);
    expect(withClient).not.toHaveBeenCalled();
    expect(bridge.createMediaSource).toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it("uses the managed parent authority when no bridge exists", async () => {
    const managed = client();
    managedState.current = { status: "ready", authority: { client: managed } };
    await downloadChatFile(posix, "a.zip", new AbortController().signal);
    expect(managed.createMediaSource).toHaveBeenCalled();
  });

  it("refuses when no owning client is available instead of falling back", async () => {
    await expect(downloadChatFile(posix, "a.zip", new AbortController().signal)).rejects.toThrow(
      "Remote server not found.",
    );
    expect(click).not.toHaveBeenCalled();
  });

  it("releases the minted grant when aborted before the handoff", async () => {
    const remote = client();
    const controller = new AbortController();
    let mintResolve!: (value: MediaSource) => void;
    remote.createMediaSource.mockImplementation(
      () =>
        new Promise<MediaSource>((resolve) => {
          mintResolve = resolve;
        }),
    );
    withClient.mockImplementation((_id, run) => run(remote));
    const pending = downloadChatFile({ ...posix, remoteServerId: "h" }, "a.zip", controller.signal);
    controller.abort();
    mintResolve({
      ticket: "t",
      url: "https://h/m?ticket=t",
      expiresAt: "",
      sizeBytes: 1,
      modifiedAtMs: 1,
      contentType: "application/octet-stream",
    });
    await pending;
    expect(remote.releaseMediaSource).toHaveBeenCalledWith("t");
    expect(click).not.toHaveBeenCalled();
  });

  it("hands the ticket URL to the sanctioned native openExternal in the native shell", async () => {
    capabilities.nativeShell = true;
    const remote = client();
    withClient.mockImplementation((_id, run) => run(remote));
    await downloadChatFile(
      { ...posix, remoteServerId: "h" },
      "a.zip",
      new AbortController().signal,
    );
    expect(bridgeHandle.openExternal).toHaveBeenCalledWith(
      "https://host/api/files/media?ticket=pc_media_t",
    );
    expect(click).not.toHaveBeenCalled();
    expect(remote.releaseMediaSource).not.toHaveBeenCalled();
  });

  it("releases the grant when native openExternal rejects", async () => {
    capabilities.nativeShell = true;
    const remote = client();
    withClient.mockImplementation((_id, run) => run(remote));
    bridgeHandle.openExternal.mockRejectedValueOnce(new Error("denied"));
    await expect(
      downloadChatFile({ ...posix, remoteServerId: "h" }, "a.zip", new AbortController().signal),
    ).rejects.toThrow("denied");
    expect(remote.releaseMediaSource).toHaveBeenCalledWith("pc_media_t");
    expect(click).not.toHaveBeenCalled();
  });

  it("releases the grant when the anchor handoff throws", async () => {
    const remote = client();
    withClient.mockImplementation((_id, run) => run(remote));
    click.mockImplementationOnce(() => {
      throw new Error("no document");
    });
    await expect(
      downloadChatFile({ ...posix, remoteServerId: "h" }, "a.zip", new AbortController().signal),
    ).rejects.toThrow("no document");
    expect(remote.releaseMediaSource).toHaveBeenCalledWith("pc_media_t");
  });

  it("propagates a mint failure without an anchor", async () => {
    const remote = client();
    remote.createMediaSource.mockRejectedValue(new Error("415"));
    withClient.mockImplementation((_id, run) => run(remote));
    await expect(
      downloadChatFile({ ...posix, remoteServerId: "h" }, "a.zip", new AbortController().signal),
    ).rejects.toThrow("415");
    expect(click).not.toHaveBeenCalled();
  });
});
