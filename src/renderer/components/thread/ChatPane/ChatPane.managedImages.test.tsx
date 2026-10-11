import {
  createImageActivation,
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
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteEnvironmentImageBytes } from "@/shared/remote/clientEnvironmentImages";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { remoteImageRef } from "@/shared/remote";
import { setRemoteImageRefResolver } from "@/shared/imageRefDisplay";
import { toLocalFileUrl } from "@/shared/promptContent";
import {
  getRemoteBridgeImageReadiness,
  remoteBridgeImageRefUrl,
  setRemoteBridgeClient,
} from "@/renderer/browser/remoteBridge";
import { readManagedLoopbackImageSession } from "@/renderer/state/managedLoopbackImages";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { invalidateCachedThreadGallery } from "./parts/items/threadGalleryImages";
import { ChatPane } from "./ChatPane";
import type { ChatPaneActions } from "./chatPaneActionsContext";

const paneActionsFixture = vi.hoisted(() => ({ current: null as ChatPaneActions | null }));

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
vi.mock("@/renderer/state/projectRootNamesStore", () => ({ useProjectRootNames: () => undefined }));
vi.mock("./ChatScrollControls", () => ({ ChatScrollControls: () => null }));
vi.mock("./parts/items/SubAgentOverlay", () => ({ SubAgentOpenController: () => null }));
vi.mock("./parts/MessageList", async () => {
  const { ImageView } = await import("./parts/items/ImageView");
  const { AssistantMessage } = await import("./parts/items/AssistantMessage");
  const { useThreadGalleryImages } = await import("../useThreadGalleryImages");
  const { useChatPaneActions } = await import("./chatPaneActionsContext");
  return {
    MessageList: ({ threadId }: { threadId: string }) => {
      paneActionsFixture.current = useChatPaneActions();
      const items = useAppStore((state) => state.runtimeItemsByIdByThread[threadId]);
      const gallery = useThreadGalleryImages(threadId);
      return (
        <>
          <span data-testid="gallery-url">{gallery[0]?.src}</span>
          {Object.values(items ?? {}).map((item) =>
            item.type === "assistant_message" ? (
              <AssistantMessage
                key={item.id}
                threadId={threadId}
                item={item}
                isTurnActive={false}
              />
            ) : (
              <ImageView key={item.id} item={item} />
            ),
          )}
        </>
      );
    },
  };
});

const threadId = "managed-chat";
const hostRef = {
  threadId,
  itemId: "generated",
  path: ["images", 0],
  mime: "image/png",
  bytes: 4,
  width: 1024,
  height: 768,
};

function seedThread(projectId = "project"): Thread {
  const project: Project = {
    id: projectId,
    name: "Fixture",
    location: { kind: "posix", path: "/fixture" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const thread: Thread = {
    id: threadId,
    projectId,
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
    projects: projectId === "missing-project" ? [] : [project],
    threads: [thread],
    runtimeItemIdsByThread: { [threadId]: ["generated", "assistant"] },
    runtimeItemsByIdByThread: {
      [threadId]: {
        generated: {
          id: "generated",
          type: "tool_call",
          state: "completed",
          streams: {},
          payload: { name: "Read", status: "success", images: [remoteImageRef(hostRef)] },
        },
        assistant: {
          id: "assistant",
          type: "assistant_message",
          state: "completed",
          streams: {},
          payload: { content: [{ kind: "image", dataUrl: remoteImageRef(hostRef) }] },
        },
      },
    },
    runtimeStructuralVersionByThread: { [threadId]: 1 },
    runtimeCompletedTurnsByThread: {},
    runtimeRequestsByThread: {},
    fileCheckpointsByThread: {},
    fileCheckpointTurnsByThread: {},
    connectingThreadIds: {},
    provisioningWorktreeThreadIds: {},
  });
  return thread;
}

function mountPane(thread: Thread) {
  return render(
    <AppProvider>
      <ChatPane thread={thread} hasSupplementaryContent />
    </AppProvider>,
  );
}

beforeEach(() => {
  setupManagedImageFixture();
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  invalidateCachedThreadGallery(threadId);
  paneActionsFixture.current = null;
  setRemoteImageRefResolver(() => "https://poisoned.test/image");
});
afterEach(teardownManagedImageFixture);

it.each([
  ["browser", true],
  ["browser", false],
  ["attached Electron", true],
  ["attached Electron", false],
] as const)(
  "preserves %s named projection on the active bridge (persisted record: %s)",
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
    mountPane(projected);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    for (const img of screen.getAllByRole("img"))
      expect(img).toHaveAttribute("src", "blob:managed-image-1");
    expect(paneActionsFixture.current?.remoteImageRefUrl).toBe(remoteBridgeImageRefUrl);
    expect(paneActionsFixture.current?.remoteImageReadiness).toBe(getRemoteBridgeImageReadiness());
    expect(browser.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
    const localUrl = toLocalFileUrl("/tmp/browser-path.png");
    expect(paneActionsFixture.current?.remoteLocalImageUrl?.(localUrl)).toBe("");
    await waitFor(() =>
      expect(getRemoteBridgeImageReadiness()?.resolvePath("/tmp/browser-path.png")).toBe(
        "blob:managed-image-1",
      ),
    );
    expect(paneActionsFixture.current?.remoteLocalImageUrl?.(localUrl)).toBe(
      "blob:managed-image-1",
    );
    expect(browser.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it.each(["browser", "attached Electron"] as const)(
  "preserves %s environment projection on its exact selected child client/readiness",
  async (surface) => {
    const managed = createImageActivation();
    publishImageActivation(managed);
    const host = installManagedImageRuntime();
    installRemoteImageRuntime(surface, host);
    const environment = installImageEnvironmentProjection();
    seedThread();
    const projected = projectImageFixtureThread("image-child", threadId);
    mountPane(projected);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(environment.createClient).toHaveBeenCalledOnce();
    expect(environment.fetch).toHaveBeenCalledOnce();
    const [url, init] = environment.fetch.mock.calls[0]!;
    expect(String(url)).toContain(environment.child.endpoint);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer child-access");
    expect(new Headers(init?.headers).get("x-poracode-environment-authorization")).toBe(
      "Bearer parent-access",
    );
    expect(init?.certFingerprint).toBe("approved-parent-pin");
    expect(getRemoteBridgeImageReadiness()).toBeUndefined();
    expect(paneActionsFixture.current?.remoteImageReadiness?.resolveRef(hostRef)).toBe(
      "blob:managed-image-1",
    );
    expect(managed.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it.each(["project", HOME_PROJECT_ID, "missing-project"])(
  "shares exact-client bytes across tool, assistant block and gallery in managed scope %s",
  async (projectId) => {
    const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
    const activation = createImageActivation(() => held.promise);
    publishImageActivation(activation);
    installManagedImageRuntime();
    const thread = seedThread(projectId);
    const { container } = mountPane(thread);
    await waitFor(() => expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledOnce());
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelectorAll('[data-poracode-image-card="true"]')).toHaveLength(2);
    expect(
      container.querySelector<HTMLElement>('[data-poracode-image-card="true"] button span')?.style
        .aspectRatio,
    ).toBe("1024 / 768");
    await act(async () => held.resolve(imageBytes));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    for (const img of screen.getAllByRole("img"))
      expect(img).toHaveAttribute("src", "blob:managed-image-1");
    expect(screen.getByTestId("gallery-url")).toHaveTextContent("blob:managed-image-1");
    expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
  },
);

it("requests on late activation with unchanged item slices and no descriptor gate", async () => {
  installManagedImageRuntime();
  const thread = seedThread();
  const byId = useAppStore.getState().runtimeItemsByIdByThread[threadId];
  mountPane(thread);
  expect(screen.queryByRole("img")).toBeNull();
  const activation = createImageActivation();
  act(() => publishImageActivation(activation));
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]).toBe(byId);
});

it("rebinds fully-ready transcript and gallery consumers on supervisor reset without reopening the socket", async () => {
  const activation = createImageActivation();
  publishImageActivation(activation);
  installManagedImageRuntime();
  const thread = seedThread();
  mountPane(thread);
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  act(emitManagedBackendReset);
  await waitFor(() => {
    for (const img of screen.getAllByRole("img"))
      expect(img).toHaveAttribute("src", "blob:managed-image-2");
  });
  expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  expect(screen.getByTestId("gallery-url")).toHaveTextContent("blob:managed-image-2");
});

it.each(["", "missing-owner", null, 123])(
  "refuses remote ownership %j before Home/project early returns",
  (remoteServerId) => {
    const activation = createImageActivation();
    publishImageActivation(activation);
    installManagedImageRuntime();
    const thread = { ...seedThread(HOME_PROJECT_ID), remoteServerId: remoteServerId as string };
    useAppStore.setState({ threads: [thread] });
    mountPane(thread);
    expect(screen.queryByRole("img")).toBeNull();
    expect(activation.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
    expect(screen.getByTestId("gallery-url")).toBeEmptyDOMElement();
  },
);

it("removes revoked URLs from transcript cards that mount after an image is already cached", async () => {
  const activation = createImageActivation();
  publishImageActivation(activation);
  installManagedImageRuntime();
  const readiness = readManagedLoopbackImageSession()!.readiness;
  readiness.requestRef(hostRef);
  await waitFor(() => expect(readiness.resolveRef(hostRef)).toBe("blob:managed-image-1"));
  const thread = seedThread();
  const slices = useAppStore.getState().runtimeItemsByIdByThread;
  const view = mountPane(thread);
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  act(() => {
    for (let index = 0; index < 64; index++)
      readiness.requestRef({ ...hostRef, itemId: `pressure-${index}` });
  });
  await waitFor(() =>
    expect(view.container.querySelectorAll('img[src="blob:managed-image-1"]')).toHaveLength(0),
  );
  expect(screen.getByTestId("gallery-url")).toHaveTextContent("");
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  expect(useAppStore.getState().runtimeItemsByIdByThread).toBe(slices);
  expect(
    vi
      .mocked(activation.client.fetchTicketedImageBytes)
      .mock.calls.filter(([path]) => path.includes("/items/generated/")),
  ).toHaveLength(1);
});
