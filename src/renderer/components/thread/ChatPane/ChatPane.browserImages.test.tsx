import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import { remoteImageRef } from "@/shared/remote";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { ChatPane } from "./ChatPane";

const imageState = vi.hoisted(() => ({
  url: "",
  listeners: new Set<() => void>(),
  request: vi.fn<RemoteImageReadiness["requestRef"]>(),
}));
const readiness: RemoteImageReadiness = {
  resolveRef: () => imageState.url,
  subscribeRef: (_ref, listener) => {
    imageState.listeners.add(listener);
    return () => imageState.listeners.delete(listener);
  },
  requestRef: imageState.request,
  resolvePath: () => "",
  subscribePath: () => () => undefined,
  requestPath: () => undefined,
};

vi.mock("@/renderer/bridge", async (original) => ({
  ...(await original<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => true,
}));
vi.mock("@/renderer/browser/remoteBridge", async (original) => ({
  ...(await original<typeof import("@/renderer/browser/remoteBridge")>()),
  remoteBridgeImageRefUrl: () => imageState.url,
}));
vi.mock("@/renderer/browser/useRemoteBridgeImages", () => ({
  useRemoteBridgeImageReadiness: () => readiness,
}));
vi.mock("@/renderer/state/chatRuntimePersister", async (original) => ({
  ...(await original<typeof import("@/renderer/state/chatRuntimePersister")>()),
  hydrateThreadRuntimeItems: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  loadOlderThreadRuntimeItems: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
  retainThreadRuntimeItems: vi.fn<() => void>(),
  releaseThreadRuntimeItems: vi.fn<() => void>(),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  hydrateFileCheckpoints: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  finalizeFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock("./ChatScrollControls", () => ({ ChatScrollControls: () => null }));
vi.mock("./parts/items/SubAgentOverlay", () => ({ SubAgentOpenController: () => null }));
// Keep the actual pane context and image consumer; virtual scrolling is unrelated
// to whether a pending reference ever requests its authenticated bytes.
vi.mock("./parts/MessageList", async () => {
  const { ImageView } = await import("./parts/items/ImageView");
  return {
    MessageList: () => (
      <ImageView
        item={{
          id: "image-1",
          type: "tool_call",
          state: "completed",
          streams: {},
          payload: {
            name: "Read",
            status: "success",
            images: [
              remoteImageRef({
                threadId: "thread-1",
                itemId: "image-1",
                path: ["images", 0],
                mime: "image/png",
                bytes: 100,
                width: 320,
                height: 240,
              }),
            ],
          },
        }}
      />
    ),
  };
});

beforeEach(() => {
  imageState.url = "";
  imageState.listeners.clear();
  imageState.request.mockClear();
  setRemoteImageRefResolver(null);
  Object.defineProperty(window, "poracode", {
    configurable: true,
    value: {
      arch: "web",
      appVersion: "remote",
      dbSetState: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  });
});

it.each(["project-1", HOME_PROJECT_ID])(
  "requests and resolves a pending image on paired browser host scope %s",
  async (projectId) => {
    const project: Project = {
      id: projectId,
      name: "Fixture",
      location: { kind: "posix", path: "/fixture" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const thread: Thread = {
      id: "thread-1",
      projectId: project.id,
      title: "Fixture",
      agentKind: "acp-generic",
      config: { model: "fixture" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    };
    useAppStore.setState({
      projects: [project],
      threads: [thread],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeCompletedTurnsByThread: {},
      runtimeRequestsByThread: {},
      fileCheckpointsByThread: {},
      fileCheckpointTurnsByThread: {},
      connectingThreadIds: {},
      provisioningWorktreeThreadIds: {},
    });
    render(
      <AppProvider>
        <ChatPane thread={thread} hasSupplementaryContent />
      </AppProvider>,
    );
    await waitFor(() => expect(imageState.request).toHaveBeenCalled());
    expect(screen.queryByRole("img")).toBeNull();
    act(() => {
      imageState.url = "blob:fixture-image";
      for (const listener of imageState.listeners) listener();
    });
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:fixture-image");
  },
);
