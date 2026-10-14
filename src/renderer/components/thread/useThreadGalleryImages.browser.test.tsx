import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { remoteImageRef } from "@/shared/remote";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import { invalidateCachedThreadGallery } from "./ChatPane/parts/items/threadGalleryImages";
import { getThreadGalleryImages, useThreadGalleryImages } from "./useThreadGalleryImages";

const fixture = vi.hoisted(() => ({
  url: "",
  listeners: new Set<() => void>(),
  request: vi.fn<(ref: unknown) => void>(),
  state: {
    threads: [{ id: "browser-gallery", projectId: "project", agentKind: "test" }],
    projects: [],
    runtimeItemIdsByThread: { "browser-gallery": ["image"] },
    runtimeItemsByIdByThread: {} as Record<string, Record<string, unknown>>,
    runtimeStructuralVersionByThread: { "browser-gallery": 1 },
  },
}));
const readiness: RemoteImageReadiness = {
  resolveRef: () => fixture.url,
  requestRef: fixture.request,
  subscribeRef: (_ref, listener) => {
    fixture.listeners.add(listener);
    return () => fixture.listeners.delete(listener);
  },
  resolvePath: () => "",
  requestPath: () => undefined,
  subscribePath: () => () => undefined,
};
vi.mock("@/renderer/bridge", async (original) => ({
  ...(await original<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => true,
}));
vi.mock("@/renderer/browser/remoteBridge", async (original) => ({
  ...(await original<typeof import("@/renderer/browser/remoteBridge")>()),
  remoteBridgeImageRefUrl: () => fixture.url,
  getRemoteBridgeImageReadiness: () => readiness,
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state),
    {
      getState: () => fixture.state,
    },
  ),
}));
vi.mock("@/renderer/browser/useRemoteBridgeImages", () => ({
  useRemoteBridgeImageReadiness: () => readiness,
}));

beforeEach(() => {
  fixture.url = "";
  fixture.listeners.clear();
  invalidateCachedThreadGallery("browser-gallery");
  setRemoteImageRefResolver(() => "https://legacy.test/image");
  fixture.state.runtimeItemsByIdByThread = {
    "browser-gallery": {
      image: {
        id: "image",
        type: "image_view",
        state: "completed",
        streams: {},
        payload: {
          images: [
            remoteImageRef({
              threadId: "browser-gallery",
              itemId: "image",
              path: ["images", 0],
              mime: "image/png",
              bytes: 100,
              width: 320,
              height: 240,
            }),
          ],
        },
      },
    },
  };
});

it.each(["project", HOME_PROJECT_ID])(
  "uses own-host readiness and matching gallery URLs for %s",
  async (projectId) => {
    fixture.state.threads[0]!.projectId = projectId;
    const { result, unmount } = renderHook(() => useThreadGalleryImages("browser-gallery"));
    expect(result.current).toEqual([]);
    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.listeners.size).toBe(1);
    act(() => {
      fixture.url = "blob:browser-gallery-ready";
      for (const listener of fixture.listeners) listener();
    });
    await waitFor(() => expect(result.current[0]?.src).toBe(fixture.url));
    expect(getThreadGalleryImages("browser-gallery")[0]?.src).toBe(fixture.url);
    expect(getThreadGalleryImages("browser-gallery")).toBe(result.current);
    unmount();
    expect(fixture.listeners.size).toBe(0);
  },
);
