import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import * as environmentSessions from "@/renderer/state/remoteServers/environmentSessions";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import type { ChatPaneActions } from "./chatPaneActionsContext";
import { remoteImageRef } from "@/shared/remote";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { ChatPane } from "./ChatPane";

const imageState = vi.hoisted(() => ({
  url: "",
  listeners: new Set<() => void>(),
  request: vi.fn<RemoteImageReadiness["requestRef"]>(),
  actions: [] as (ChatPaneActions | null)[],
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
  const { useChatPaneActions } = await import("./chatPaneActionsContext");
  return {
    MessageList: () => {
      const actions = useChatPaneActions();
      imageState.actions.push(actions);
      return (
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
                  threadId: actions?.threadId ?? "thread-1",
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
      );
    },
  };
});

beforeEach(() => {
  imageState.url = "";
  imageState.listeners.clear();
  imageState.request.mockClear();
  imageState.actions = [];
  useRemoteServersStore.setState({ servers: [] });
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

function environmentOwner(): RemoteServerRecord {
  return {
    connectionId: "environment-owner",
    desktopId: "child-host",
    label: "Environment",
    endpoint: "https://fixture.test/api/environments/child/proxy/",
    accessToken: "first-owner",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: "parent-owner",
      environmentId: "11111111-1111-4111-8111-111111111111",
      childDesktopId: "child-host",
    },
  };
}

function seedPane(projectId: string, remoteServerId?: string): Thread {
  const project: Project = {
    id: projectId,
    name: "Fixture",
    location: { kind: "posix", path: "/fixture" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const thread: Thread = {
    id: remoteServerId ? "environment-thread" : "thread-1",
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
    ...(remoteServerId !== undefined ? { remoteServerId } : {}),
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
  return thread;
}

it("keeps environment image actions stable across unrelated thread metadata updates", async () => {
  const owner = environmentOwner();
  useRemoteServersStore.setState({ servers: [owner] });
  // Environment adapters deliberately return a new wrapper around their live
  // owner on each lookup. Thread metadata must not invalidate every image row.
  const lookup = vi
    .spyOn(environmentSessions, "environmentImageReadinessFor")
    .mockImplementation(() => ({ ...readiness }));
  try {
    const thread = seedPane("project-1", owner.connectionId);
    const pane = (row: Thread) => (
      <AppProvider>
        <ChatPane thread={row} hasSupplementaryContent />
      </AppProvider>
    );
    const view = render(pane(thread));
    await waitFor(() => expect(imageState.request).toHaveBeenCalled());
    const actions = imageState.actions.at(-1);
    expect(actions?.remoteImageReadiness).toBeDefined();
    view.rerender(pane({ ...thread, updatedAt: "2026-01-02T00:00:00.000Z" }));
    expect(imageState.actions.at(-1)).toBe(actions);
    view.unmount();
  } finally {
    lookup.mockRestore();
  }
});

it("refreshes image custody when the owner record changes without replacing the thread", async () => {
  const owner = environmentOwner();
  useRemoteServersStore.setState({ servers: [owner] });
  const lookup = vi
    .spyOn(environmentSessions, "environmentImageReadinessFor")
    .mockImplementation(() => {
      const token = useRemoteServersStore.getState().servers[0]!.accessToken;
      return { ...readiness, resolveRef: () => `blob:${token}` };
    });
  try {
    const thread = seedPane("project-1", owner.connectionId);
    const view = render(
      <AppProvider>
        <ChatPane thread={thread} hasSupplementaryContent />
      </AppProvider>,
    );
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:first-owner");
    await act(() =>
      useRemoteServersStore.setState({ servers: [{ ...owner, accessToken: "next-owner" }] }),
    );
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:next-owner");
    view.unmount();
  } finally {
    lookup.mockRestore();
  }
});

it.each(["project-1", HOME_PROJECT_ID])(
  "requests and resolves a pending image on paired browser host scope %s",
  async (projectId) => {
    const thread = seedPane(projectId);
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
import "fake-indexeddb/auto";
