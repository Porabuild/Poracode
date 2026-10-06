import {
  createImageActivation,
  createObjectUrl,
  emitManagedBackendReset,
  imageBytes,
  installManagedImageRuntime,
  installRemoteImageRuntime,
  installImageEnvironmentProjection,
  projectImageFixtureThread,
  publishImageActivation,
  revokeObjectUrl,
  setupManagedImageFixture,
  teardownManagedImageFixture,
} from "@/renderer/state/managedLoopbackImages.testFixtures";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { remoteImageRef } from "@/shared/remote";
import type { RemoteEnvironmentImageBytes } from "@/shared/remote/clientEnvironmentImages";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import { setRemoteLocalImageResolver } from "@/shared/localImageDisplay";
import { toLocalFileUrl } from "@/shared/promptContent";
import {
  getRemoteBridgeImageReadiness,
  setRemoteBridgeClient,
} from "@/renderer/browser/remoteBridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import {
  installManagedLoopbackImages,
  readManagedLoopbackImageSession,
} from "@/renderer/state/managedLoopbackImages";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageLightboxHost } from "@/renderer/components/composer/ImageLightbox";
import {
  getThreadGalleryImages,
  openThreadGallery,
  useThreadGalleryImages,
} from "./useThreadGalleryImages";
import {
  buildGalleryResolversFromState,
  invalidateCachedThreadGallery,
} from "./ChatPane/parts/items/threadGalleryImages";

const threadId = "managed-gallery";
const inline =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=";
const hostRef = {
  threadId,
  itemId: "ref-only",
  path: ["images", 0],
  mime: "image/png",
  bytes: 4,
  width: 1024,
  height: 768,
};

function seedThread(projectId = "project", remoteServerId?: string): void {
  useAppStore.setState({
    threads: [
      {
        id: threadId,
        projectId,
        agentKind: "acp-generic",
        ...(remoteServerId !== undefined ? { remoteServerId } : {}),
      },
    ],
    projects: [{ id: projectId, location: { kind: "posix", path: "/fixture" } }],
    runtimeItemIdsByThread: { [threadId]: ["ref-only", "inline-first"] },
    runtimeItemsByIdByThread: {
      [threadId]: {
        "ref-only": {
          id: "ref-only",
          type: "image_view",
          state: "completed",
          streams: {},
          payload: { images: [remoteImageRef(hostRef)] },
        },
        "inline-first": {
          id: "inline-first",
          type: "tool_call",
          state: "completed",
          streams: {},
          payload: {
            name: "Read",
            status: "success",
            images: [inline],
          },
        },
      },
    },
    runtimeStructuralVersionByThread: { [threadId]: 1 },
  } as never);
}

function mountLightbox() {
  return render(
    <AppProvider>
      <ImageLightboxHost />
    </AppProvider>,
  );
}

function addLocalPathItems(): void {
  useAppStore.setState((state) => ({
    runtimeItemIdsByThread: {
      [threadId]: [...state.runtimeItemIdsByThread[threadId]!, "attachment", "markdown"],
    },
    runtimeItemsByIdByThread: {
      [threadId]: {
        ...state.runtimeItemsByIdByThread[threadId],
        attachment: {
          id: "attachment",
          type: "user_message",
          state: "completed",
          streams: {},
          payload: { content: [{ kind: "image", source: "attachment", path: "/tmp/local.png" }] },
        },
        markdown: {
          id: "markdown",
          type: "assistant_message",
          state: "completed",
          streams: {},
          payload: { content: [{ kind: "text", text: "![native](images/native.png)" }] },
        },
      },
    },
  }));
}

beforeEach(() => {
  setupManagedImageFixture();
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  invalidateCachedThreadGallery(threadId);
  setRemoteImageRefResolver(() => "https://poisoned.test/image");
});
afterEach(teardownManagedImageFixture);

it("updates a mounted gallery and lightbox with every image from one tool row", async () => {
  const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
  const activation = createImageActivation(() => held.promise);
  publishImageActivation(activation);
  installManagedImageRuntime();
  seedThread();
  const trailingRef = { ...hostRef, itemId: "inline-first", path: ["images", 1] };
  useAppStore.setState((state) => ({
    runtimeItemsByIdByThread: {
      [threadId]: {
        ...state.runtimeItemsByIdByThread[threadId],
        "inline-first": {
          ...state.runtimeItemsByIdByThread[threadId]!["inline-first"]!,
          payload: { status: "success", images: [inline, remoteImageRef(trailingRef)] },
        },
      },
    },
  }));
  const { result } = renderHook(() => useThreadGalleryImages(threadId));
  expect(result.current.map((image) => image.src)).toEqual([inline]);
  expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
  mountLightbox();
  act(() => openThreadGallery(result.current, inline, 0, threadId));
  await act(async () => held.resolve(imageBytes));
  await waitFor(() =>
    expect(result.current.map((image) => image.src)).toEqual(["blob:managed-image-1", inline]),
  );
  // Each coordinate authenticates independently; equal bytes share one URL.
  expect(createObjectUrl).toHaveBeenCalledOnce();
  expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
  expect(getThreadGalleryImages(threadId)).toBe(result.current);
  expect(screen.getByRole("img")).toHaveAttribute("src", inline);
  fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
});

it.each(["project", HOME_PROJECT_ID])(
  "preserves candidate order and updates an open lightbox from pending managed scope %s",
  async (projectId) => {
    const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
    const activation = createImageActivation(() => held.promise);
    publishImageActivation(activation);
    installManagedImageRuntime();
    seedThread(projectId);
    const { result } = renderHook(() => useThreadGalleryImages(threadId));
    expect(result.current.map((image) => image.src)).toEqual([inline]);
    expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
    expect(getThreadGalleryImages(threadId)).toBe(result.current);
    mountLightbox();
    act(() => openThreadGallery(result.current, inline, 0, threadId));
    expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
    await act(async () => held.resolve(imageBytes));
    await waitFor(() =>
      expect(result.current.map((image) => image.src)).toEqual([inline, "blob:managed-image-1"]),
    );
    expect(getThreadGalleryImages(threadId)).toBe(result.current);
    fireEvent.click(await screen.findByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
    expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
  },
);

it("invalidates fully-ready hook and click-time galleries on loss and same-port replacement", async () => {
  const first = createImageActivation();
  publishImageActivation(first);
  installManagedImageRuntime();
  seedThread();
  const slices = useAppStore.getState().runtimeItemsByIdByThread;
  const { result } = renderHook(() => useThreadGalleryImages(threadId));
  await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
  const ready = result.current;
  mountLightbox();
  act(() => openThreadGallery(ready, ready[1]!.src, 0, threadId));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
  act(() => publishImageActivation(null));
  expect(result.current.map((image) => image.src)).toEqual([inline]);
  expect(getThreadGalleryImages(threadId)).toBe(result.current);
  expect(screen.getByRole("img")).toHaveAttribute("src", inline);
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  const successor = createImageActivation();
  expect(successor.endpoint).toBe(first.endpoint);
  act(() => publishImageActivation(successor));
  await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-2"));
  expect(getThreadGalleryImages(threadId)).toBe(result.current);
  expect(successor.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
  expect(useAppStore.getState().runtimeItemsByIdByThread).toBe(slices);
  fireEvent.click(screen.getByRole("button", { name: "Next image" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-2");
});

it.each(["same-port replacement", "supervisor-only reset"])(
  "fences pending completion and recovers an unchanged mounted gallery after %s",
  async (operation) => {
    const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
    const first = createImageActivation();
    vi.mocked(first.client.fetchTicketedImageBytes).mockImplementationOnce(() => held.promise);
    publishImageActivation(first);
    installManagedImageRuntime();
    seedThread();
    const { result } = renderHook(() => useThreadGalleryImages(threadId));
    const signal = vi.mocked(first.client.fetchTicketedImageBytes).mock.calls[0]![1];
    mountLightbox();
    act(() => openThreadGallery(result.current, inline, 0, threadId));
    const replacement = operation === "same-port replacement" ? createImageActivation() : first;
    act(() => {
      if (operation === "supervisor-only reset") emitManagedBackendReset();
      else publishImageActivation(replacement);
    });
    expect(signal.aborted).toBe(true);
    await act(async () => held.resolve(imageBytes));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(replacement.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(
      operation === "supervisor-only reset" ? 2 : 1,
    );
    expect(getThreadGalleryImages(threadId)).toBe(result.current);
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
  },
);

it("rebuilds a fully-ready lightbox and click-time cache on reset with the same client and no reopen", async () => {
  const activation = createImageActivation();
  publishImageActivation(activation);
  installManagedImageRuntime();
  seedThread();
  const { result } = renderHook(() => useThreadGalleryImages(threadId));
  await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
  mountLightbox();
  act(() => openThreadGallery(result.current, result.current[1]!.src, 0, threadId));
  act(emitManagedBackendReset);
  await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-2"));
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
  expect(getThreadGalleryImages(threadId)).toBe(result.current);
  expect(screen.getByRole("img")).not.toHaveAttribute("src", "blob:managed-image-1");
  fireEvent.click(screen.getByRole("button", { name: "Next image" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-2");
});

it("invalidates click-time custody without a mounted gallery or an incidental store update", async () => {
  publishImageActivation(createImageActivation());
  installManagedImageRuntime();
  seedThread();
  readManagedLoopbackImageSession()!.readiness.requestRef(hostRef);
  await waitFor(() => expect(createObjectUrl).toHaveBeenCalledOnce());
  const ready = getThreadGalleryImages(threadId);
  expect(ready[1]?.src).toBe("blob:managed-image-1");
  publishImageActivation(null);
  expect(getThreadGalleryImages(threadId).map((image) => image.src)).toEqual([inline]);
  publishImageActivation(createImageActivation());
  readManagedLoopbackImageSession()!.readiness.requestRef(hostRef);
  await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(2));
  expect(getThreadGalleryImages(threadId)[1]?.src).toBe("blob:managed-image-2");
});

it.each(["browser", "attached Electron"])(
  "keeps %s custody separate and invalidates a ready browser cache on client replacement",
  async (surface) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    const host = installManagedImageRuntime();
    installRemoteImageRuntime(surface as "browser" | "attached Electron", host);
    // Deliberately keep concurrent managed custody to prove native shell/cache
    // presence cannot override the installed remote transport's owner.
    installManagedLoopbackImages(host);
    const browser = createImageActivation();
    setRemoteBridgeClient(browser.client);
    seedThread();
    const { result } = renderHook(() => useThreadGalleryImages(threadId));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
    const previous = result.current;
    const replacement = createImageActivation();
    act(() => setRemoteBridgeClient(replacement.client));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-2"));
    expect(result.current).not.toBe(previous);
    expect(getThreadGalleryImages(threadId)).toBe(result.current);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
    const browserImages = result.current;
    act(emitManagedBackendReset);
    expect(result.current).toBe(browserImages);
    expect(revokeObjectUrl).not.toHaveBeenCalledWith("blob:managed-image-2");
  },
);

it.each([
  ["browser", true],
  ["browser", false],
  ["attached Electron", true],
  ["attached Electron", false],
] as const)(
  "preserves the %s active bridge/cache for a named projection (persisted record: %s)",
  async (surface, persisted) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    const host = installManagedImageRuntime();
    installRemoteImageRuntime(surface, host);
    const browser = createImageActivation();
    const clientFactory = vi.fn<ReturnType<typeof useRemoteServersStore.getState>["clientFactory"]>(
      () => {
        throw new Error("duplicate direct image client");
      },
    );
    useRemoteServersStore.setState({
      servers: persisted
        ? [
            {
              connectionId: "browser-owner",
              desktopId: "browser-owner",
              label: "Browser",
              endpoint: browser.endpoint,
              accessToken: "browser-access",
              scopes: ["session:read"],
              transport: { kind: "direct" },
            },
          ]
        : [],
      clientFactory,
    });
    setRemoteBridgeClient(browser.client);
    seedThread();
    const projected = projectImageFixtureThread("browser-owner", threadId);
    const { result } = renderHook(() => useThreadGalleryImages(projected.id));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
    expect(getThreadGalleryImages(projected.id)).toBe(result.current);
    const resolvers = buildGalleryResolversFromState(useAppStore.getState(), projected.id);
    expect(resolvers.imageUrlForPath?.("/tmp/browser-path.png")).toBe("");
    await waitFor(() =>
      expect(getRemoteBridgeImageReadiness()?.resolvePath("/tmp/browser-path.png")).toBe(
        "blob:managed-image-1",
      ),
    );
    expect(resolvers.remoteLocalImageUrl?.(toLocalFileUrl("/tmp/browser-path.png"))).toBe(
      "blob:managed-image-1",
    );
    expect(browser.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
    const replacement = createImageActivation();
    act(() => setRemoteBridgeClient(replacement.client));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-2"));
    expect(getThreadGalleryImages(projected.id)).toBe(result.current);
    expect(replacement.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
    expect(clientFactory).not.toHaveBeenCalled();
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it.each(["browser", "attached Electron"] as const)(
  "keeps the %s named environment gallery on the selected child client/readiness",
  async (surface) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    const host = installManagedImageRuntime();
    installRemoteImageRuntime(surface, host);
    const environment = installImageEnvironmentProjection();
    seedThread();
    const projected = projectImageFixtureThread("image-child", threadId);
    const { result } = renderHook(() => useThreadGalleryImages(projected.id));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
    expect(getThreadGalleryImages(projected.id)).toBe(result.current);
    expect(environment.client.imageRefUrl(hostRef)).toBe("blob:managed-image-1");
    expect(environment.createClient).toHaveBeenCalledOnce();
    expect(environment.fetch).toHaveBeenCalledOnce();
    const [url, init] = environment.fetch.mock.calls[0]!;
    expect(String(url)).toContain(environment.child.endpoint);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer child-access");
    expect(new Headers(init?.headers).get("x-poracode-environment-authorization")).toBe(
      "Bearer parent-access",
    );
    expect(init?.certFingerprint).toBe("approved-parent-pin");
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it.each(["direct", "ssh"] as const)(
  "keeps a %s connection and equal ref key independent of managed cache/reset",
  async (kind) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    installManagedImageRuntime();
    readManagedLoopbackImageSession()!.readiness.requestRef(hostRef);
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledOnce());
    const remote = createImageActivation();
    const server: RemoteServerRecord = {
      connectionId: "remote-owner",
      desktopId: "other-host",
      label: "Remote",
      endpoint: "https://other.test/",
      accessToken: "remote-access",
      scopes: ["session:read"],
      transport:
        kind === "ssh"
          ? {
              kind,
              connection: {
                id: "11111111-1111-4111-8111-111111111111",
                label: "SSH",
                target: "host",
              },
            }
          : { kind },
    };
    const clientFactory = vi.fn<ReturnType<typeof useRemoteServersStore.getState>["clientFactory"]>(
      () => remote.client,
    );
    useRemoteServersStore.setState({ servers: [server], clientFactory });
    seedThread("project", "remote-owner");
    const { result } = renderHook(() => useThreadGalleryImages(threadId));
    await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-2"));
    expect(remote.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
    expect(managed.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
    const ready = result.current;
    act(emitManagedBackendReset);
    expect(result.current).toBe(ready);
    expect(getThreadGalleryImages(threadId)).toBe(ready);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
    expect(revokeObjectUrl).not.toHaveBeenCalledWith("blob:managed-image-2");
  },
);

it.each(["", "missing-owner", null, 123])(
  "refuses %j remote ownership even with live managed and browser caches",
  (remoteServerId) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    installManagedImageRuntime();
    const browser = createImageActivation();
    setRemoteBridgeClient(browser.client);
    seedThread("project", remoteServerId as string);
    setRemoteLocalImageResolver(() => "https://poisoned.test/local");
    addLocalPathItems();
    const { result } = renderHook(() => useThreadGalleryImages(threadId));
    expect(result.current.map((image) => image.src)).toEqual([inline]);
    expect(getThreadGalleryImages(threadId)).toBe(result.current);
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
    expect(browser.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it.each(["managed", "connection", "malformed"] as const)(
  "keeps an unavailable %s environment child separate from managed root custody",
  (parent) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    installManagedImageRuntime();
    const browser = createImageActivation();
    setRemoteBridgeClient(browser.client);
    const server: RemoteServerRecord = {
      connectionId: "child-owner",
      desktopId: "child-host",
      label: "Child",
      endpoint: "http://127.0.0.1:49152/api/environments/child/proxy/",
      accessToken: "child-access",
      scopes: ["session:read"],
      transport: {
        kind: "environment",
        environmentId: "11111111-1111-4111-8111-111111111111",
        childDesktopId: "child-host",
        ...(parent === "connection"
          ? { parentConnectionId: "missing-parent" }
          : { managedHostDesktopId: "unavailable-managed-parent" }),
        ...(parent === "malformed" ? { parentConnectionId: "also-present" } : {}),
      },
    };
    useRemoteServersStore.setState({ servers: [server] });
    seedThread("project", "child-owner");
    const { result } = renderHook(() => useThreadGalleryImages(threadId));
    expect(result.current.map((image) => image.src)).toEqual([inline]);
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
    expect(browser.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it("preserves inline history without authority and native attachment/markdown paths", () => {
  installManagedImageRuntime();
  seedThread();
  setRemoteLocalImageResolver(() => "https://poisoned.test/local");
  addLocalPathItems();
  const { result } = renderHook(() => useThreadGalleryImages(threadId));
  expect(result.current.map((image) => image.src)).toEqual([
    toLocalFileUrl("/fixture/images/native.png"),
    toLocalFileUrl("/tmp/local.png"),
    inline,
  ]);
  expect(getThreadGalleryImages(threadId)).toBe(result.current);
  expect(createObjectUrl).not.toHaveBeenCalled();
});

it("refreshes a fully-ready gallery and open lightbox on ordinary cache eviction", async () => {
  const activation = createImageActivation();
  publishImageActivation(activation);
  installManagedImageRuntime();
  seedThread();
  const slices = useAppStore.getState().runtimeItemsByIdByThread;
  const { result } = renderHook(() => useThreadGalleryImages(threadId));
  await waitFor(() => expect(result.current[1]?.src).toBe("blob:managed-image-1"));
  mountLightbox();
  act(() => openThreadGallery(result.current, result.current[1]!.src, 0, threadId));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
  const readiness = readManagedLoopbackImageSession()!.readiness;
  act(() => {
    for (let index = 0; index < 64; index++)
      readiness.requestRef({ ...hostRef, itemId: `pressure-${index}` });
  });
  await waitFor(() => expect(result.current.map((image) => image.src)).toEqual([inline]));
  expect(getThreadGalleryImages(threadId)).toBe(result.current);
  expect(screen.getByRole("img")).toHaveAttribute("src", inline);
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  expect(useAppStore.getState().runtimeItemsByIdByThread).toBe(slices);
  // The evicted coordinate remains latched; gallery invalidation cannot drive
  // a refetch loop merely because the producer's data has not changed.
  expect(
    vi
      .mocked(activation.client.fetchTicketedImageBytes)
      .mock.calls.filter(([path]) => path.includes("/items/ref-only/")),
  ).toHaveLength(1);
});
