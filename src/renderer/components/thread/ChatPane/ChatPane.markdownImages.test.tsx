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
import type { Project, ProjectLocation, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { toLocalFileUrl } from "@/shared/promptContent";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import type { RemoteEnvironmentImageBytes } from "@/shared/remote/clientEnvironmentImages";
import { setRemoteLocalImageResolver } from "@/shared/localImageDisplay";
import { setRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { environmentSessionForServer } from "@/renderer/state/remoteServers/environmentSessions";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { ChatPane } from "./ChatPane";
import type { ChatPaneActions } from "./chatPaneActionsContext";

const pane = vi.hoisted(() => ({ actions: null as ChatPaneActions | null }));
const initialClientFactory = useRemoteServersStore.getState().clientFactory;

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
// Keep the actual pane authority, Markdown pipeline, leaf and byte cache. This
// fixture substitutes only virtual list layout and unrelated host persistence.
vi.mock("./parts/MessageList", async () => {
  const { default: ItemMarkdownInner } = await import("./parts/items/ItemMarkdownInner");
  const { useChatPaneActions } = await import("./chatPaneActionsContext");
  return {
    MessageList: ({ threadId }: { threadId: string }) => {
      pane.actions = useChatPaneActions();
      const item = useAppStore((state) => state.runtimeItemsByIdByThread[threadId]?.markdown);
      return item ? <ItemMarkdownInner text={assistantDisplayText(item)} /> : null;
    },
  };
});

function seedThread(
  projectId = "project",
  location: ProjectLocation = { kind: "posix", path: "/fixture" },
  path = "/fixture-image.png",
): Thread {
  const project: Project = {
    id: projectId,
    name: "Fixture",
    location,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const thread: Thread = {
    id: "markdown-thread",
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
    runtimeItemIdsByThread: { [thread.id]: ["markdown"] },
    runtimeItemsByIdByThread: {
      [thread.id]: {
        markdown: {
          id: "markdown",
          type: "assistant_message",
          state: "completed",
          streams: { assistant_text: `**Stable** ![Shot](<${toLocalFileUrl(path)}>).` },
          payload: { content: [] },
        },
      },
    },
    runtimeStructuralVersionByThread: { [thread.id]: 1 },
    runtimeCompletedTurnsByThread: {},
    runtimeRequestsByThread: {},
    fileCheckpointsByThread: {},
    fileCheckpointTurnsByThread: {},
    connectingThreadIds: {},
    provisioningWorktreeThreadIds: {},
  });
  return thread;
}

function mount(thread: Thread) {
  return render(
    <AppProvider syncWindowChrome={false}>
      <ChatPane thread={thread} hasSupplementaryContent />
    </AppProvider>,
  );
}

beforeEach(() => {
  setupManagedImageFixture();
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  pane.actions = null;
});
afterEach(() => {
  teardownManagedImageFixture();
  useRemoteServersStore.setState({ clientFactory: initialClientFactory });
});

it.each([
  ["browser", "project", false],
  ["browser", HOME_PROJECT_ID, false],
  ["browser", "missing-project", false],
  ["browser", "project", true],
  ["attached Electron", HOME_PROJECT_ID, true],
] as const)(
  "replaces %s Markdown authority in scope %s (projected: %s) without item/text changes",
  async (surface, scope, projected) => {
    const host = installManagedImageRuntime();
    installRemoteImageRuntime(surface, host);
    const first = createImageActivation();
    setRemoteBridgeClient(first.client);
    const thread = seedThread(scope);
    const current = projected ? projectImageFixtureThread("browser-owner", thread.id) : thread;
    const items = useAppStore.getState().runtimeItemsByIdByThread[current.id];
    const view = mount(current);
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
    expect(first.client.fetchTicketedImageBytes).toHaveBeenCalledExactlyOnceWith(
      "/api/files/image?path=%2Ffixture-image.png",
      expect.any(AbortSignal),
    );
    const card = view.container.querySelector('[data-poracode-image-card="true"]');
    const textNode = screen.getByText("Stable").firstChild;
    const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
    const second = createImageActivation(() => held.promise);
    act(() => setRemoteBridgeClient(second.client));
    await waitFor(() => expect(second.client.fetchTicketedImageBytes).toHaveBeenCalledOnce());
    expect(screen.queryByRole("img")).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
    expect(view.container.querySelector('[data-poracode-image-card="true"]')).toBe(card);
    expect(screen.getByText("Stable").firstChild).toBe(textNode);
    expect(useAppStore.getState().runtimeItemsByIdByThread[current.id]).toBe(items);
    await act(async () => held.resolve(imageBytes));
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:managed-image-2");
    act(() => setRemoteBridgeClient(null));
    expect(screen.queryByRole("img")).toBeNull();
    expect(view.container.querySelector('[data-poracode-image-card="true"]')).toBe(card);
    expect(useAppStore.getState().runtimeItemsByIdByThread[current.id]).toBe(items);
  },
);

it.each(["project", HOME_PROJECT_ID, "missing-project"])(
  "preserves base-browser paired Windows decoding before %s file actions",
  async (scope) => {
    const host = installManagedImageRuntime();
    installRemoteImageRuntime("browser", host);
    const client = createImageActivation();
    setRemoteBridgeClient(client.client, "win32");
    mount(seedThread(scope, { kind: "windows", path: "C:/fixture" }, "C:\\shots\\image%25.png"));
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
    expect(client.client.fetchTicketedImageBytes).toHaveBeenCalledExactlyOnceWith(
      "/api/files/image?path=C%3A%2Fshots%2Fimage%2525.png",
      expect.any(AbortSignal),
    );
  },
);

it.each(["project", HOME_PROJECT_ID, "missing-project"])(
  "keeps managed own-host filesystem Markdown native in %s through backend reset",
  (scope) => {
    const activation = createImageActivation();
    publishImageActivation(activation);
    installManagedImageRuntime();
    mount(seedThread(scope));
    expect(screen.getByRole("img")).toHaveAttribute("src", toLocalFileUrl("/fixture-image.png"));
    expect(pane.actions?.markdownLocalImageReadiness).toBeUndefined();
    act(emitManagedBackendReset);
    expect(screen.getByRole("img")).toHaveAttribute("src", toLocalFileUrl("/fixture-image.png"));
    expect(activation.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
  },
);

it.each(["", "missing-owner", null, 123])(
  "keeps unavailable remote Markdown owner %j out of native/global resolution",
  (remoteServerId) => {
    publishImageActivation(createImageActivation());
    installManagedImageRuntime();
    setRemoteLocalImageResolver(() => "https://wrong-global.test/image.png");
    const thread = { ...seedThread(HOME_PROJECT_ID), remoteServerId: remoteServerId as string };
    useAppStore.setState({ threads: [thread] });
    const view = mount(thread);
    expect(screen.queryByRole("img")).toBeNull();
    expect(view.container.querySelector('[data-poracode-image-card="true"]')).not.toBeNull();
  },
);

it("rebinds desktop remote Markdown to the replacement persisted owner and readiness", async () => {
  installManagedImageRuntime();
  const first = createImageActivation();
  const second = createImageActivation();
  const connectionKey = "desktop-owner";
  const server: RemoteServerRecord = {
    connectionId: connectionKey,
    desktopId: connectionKey,
    label: "Fixture",
    endpoint: "https://desktop.test/",
    accessToken: "first",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  };
  const clientFactory = vi.fn<ReturnType<typeof useRemoteServersStore.getState>["clientFactory"]>(
    (_endpoint, accessToken) => (accessToken === "first" ? first.client : second.client),
  );
  useRemoteServersStore.setState({ servers: [server], clientFactory });
  const thread = seedThread(HOME_PROJECT_ID);
  const projected = projectImageFixtureThread(connectionKey, thread.id);
  const items = useAppStore.getState().runtimeItemsByIdByThread[projected.id];
  mount(projected);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
  const stable = screen.getByText("Stable");
  await act(async () => {
    useRemoteServersStore.setState({ servers: [{ ...server, accessToken: "second" }] });
  });
  await waitFor(() =>
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-2"),
  );
  expect(clientFactory).toHaveBeenCalledTimes(2);
  expect(first.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
  expect(second.client.fetchTicketedImageBytes).toHaveBeenCalledOnce();
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  expect(useAppStore.getState().runtimeItemsByIdByThread[projected.id]).toBe(items);
  expect(screen.getByText("Stable")).toBe(stable);
});

it("keeps a mounted environment path subscribed through genuine session replacement", async () => {
  const host = installManagedImageRuntime();
  installRemoteImageRuntime("browser", host);
  const environment = installImageEnvironmentProjection();
  const thread = seedThread(HOME_PROJECT_ID);
  const projected = projectImageFixtureThread(environment.child.connectionId!, thread.id);
  const items = useAppStore.getState().runtimeItemsByIdByThread[projected.id];
  mount(projected);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:managed-image-1");
  const stable = screen.getByText("Stable");
  const replacement = { ...environment.child, accessToken: "replacement-child-access" };
  act(() => {
    useRemoteServersStore.setState((state) => ({
      servers: state.servers.map((server) =>
        server.connectionId === replacement.connectionId ? replacement : server,
      ),
    }));
    environmentSessionForServer(replacement);
  });
  await waitFor(() =>
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:managed-image-2"),
  );
  expect(environment.createClient).toHaveBeenCalledTimes(2);
  expect(environment.fetch).toHaveBeenCalledTimes(2);
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  expect(useAppStore.getState().runtimeItemsByIdByThread[projected.id]).toBe(items);
  expect(screen.getByText("Stable")).toBe(stable);
});
