import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  closeImageLightbox,
  ImageLightboxHost,
} from "@/renderer/components/composer/ImageLightbox";
import { ThreadArtifactsBubble } from "./ThreadArtifactsBubble";
import { ThreadArtifactsDock } from "./ThreadArtifactsDock";
import { ThreadImagesBubble } from "./ThreadImagesBubble";
import { ThreadDockBubbles } from "./ThreadDockBubbles";
import { ThreadImagesDock } from "./ThreadImagesDock";
import { getThreadGalleryImages } from "./useThreadGalleryImages";
import { collectThreadVideos } from "./threadVideos";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import {
  createEditorMediaSource,
  type EditorMediaSource,
} from "@/renderer/components/media/fileMediaSource";

vi.mock("@/renderer/components/media/fileMediaSource", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/media/fileMediaSource")>()),
  createEditorMediaSource: vi.fn<typeof createEditorMediaSource>(),
}));

vi.mock("@/renderer/utils/gitHelpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/utils/gitHelpers")>()),
  openFileInEditor: vi.fn<typeof openFileInEditor>(async () => undefined),
}));

const defaultLocalImageUrl = useRemoteServersStore.getState().localImageUrl;
const defaultImageReadinessFor = useRemoteServersStore.getState().imageReadinessFor;

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div role="tooltip">{props.children}</div>,
  });
  return { ...actual, Tooltip };
});

function seedThreadWithImages(threadId: string) {
  const now = new Date().toISOString();
  useAppStore.setState({
    threads: [
      {
        id: threadId,
        projectId: "project-1",
        title: "Gallery thread",
        agentKind: "codex",
        config: { model: "test" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        presentationMode: "gui",
        done: false,
        archived: false,
        starred: false,
        createdAt: now,
        updatedAt: now,
      } as Thread,
    ],
    projects: [
      {
        id: "project-1",
        name: "P",
        location: { kind: "windows", path: "E:\\work\\p" },
        createdAt: now,
      } as Project,
    ],
    runtimeItemIdsByThread: { [threadId]: ["u1", "a1", "t1"] },
    runtimeItemsByIdByThread: {
      [threadId]: {
        u1: {
          id: "u1",
          type: "user_message",
          state: "completed",
          payload: {
            content: [
              {
                kind: "image",
                source: "attachment",
                path: "/tmp/a.png",
                name: "a.png",
                mimeType: "image/png",
                dataUrl: "",
              },
            ],
          },
          streams: {},
        },
        a1: {
          id: "a1",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              { kind: "text", text: "see ![x](https://example.test/x.png)" },
              {
                kind: "image",
                dataUrl: "data:image/png;base64,AAA",
                mimeType: "image/png",
                name: "gen.png",
              },
            ],
          },
          streams: { assistant_text: "see ![x](https://example.test/x.png)" },
        },
        t1: {
          id: "t1",
          type: "image_view",
          state: "completed",
          payload: {
            name: "imageGeneration",
            status: "success",
            result: { image: "data:image/png;base64,BBB" },
          },
          streams: {},
        },
      },
    },
  });
}

describe("ThreadImagesBubble", () => {
  beforeEach(() => {
    closeImageLightbox();
    useAppStore.setState({
      threads: [],
      projects: [],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
      runtimeBackgroundTasksByThread: {},
    });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      localImageUrl: defaultLocalImageUrl,
      imageReadinessFor: defaultImageReadinessFor,
    });
    usePanelStore.setState({
      threadDocksPanelOpen: false,
      threadDocksFocus: null,
      rightPanelTab: "git",
    });
  });

  afterEach(() => {
    closeImageLightbox();
    cleanup();
  });

  it("stays hidden when the thread holds no media", () => {
    const now = new Date().toISOString();
    useAppStore.setState({
      threads: [
        {
          id: "t-empty",
          projectId: "project-1",
          title: "Empty",
          agentKind: "codex",
          config: { model: "test" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          presentationMode: "gui",
          done: false,
          archived: false,
          starred: false,
          createdAt: now,
          updatedAt: now,
        } as Thread,
      ],
      projects: [],
      runtimeItemIdsByThread: { "t-empty": [] },
      runtimeItemsByIdByThread: { "t-empty": {} },
    });
    render(<ThreadImagesBubble threadId="t-empty" />);
    expect(screen.queryByRole("button", { name: "Show media" })).not.toBeInTheDocument();
  });

  it("shows combined image and video count and toggles Thread info focused on media", () => {
    seedThreadWithImages("t-gallery");
    const existing = useAppStore.getState().runtimeItemsByIdByThread["t-gallery"]!;
    useAppStore.setState({
      runtimeItemIdsByThread: { "t-gallery": ["u1", "a1", "t1", "v1"] },
      runtimeItemsByIdByThread: {
        "t-gallery": {
          ...existing,
          v1: {
            id: "v1",
            type: "user_message",
            state: "completed",
            payload: {
              content: [
                {
                  kind: "file",
                  path: "/tmp/demo.mp4",
                  name: "demo.mp4",
                  mimeType: "video/mp4",
                },
              ],
            },
            streams: {},
          },
        },
      },
      runtimeStructuralVersionByThread: { "t-gallery": 1 },
    });
    render(
      <>
        <ThreadImagesBubble threadId="t-gallery" />
        <ImageLightboxHost />
      </>,
    );
    const bubble = screen.getByRole("button", { name: "Show media" });
    // 4 images + 1 video = 5
    expect(bubble).toHaveClass("poracode-floating-chrome--bubble");
    expect(bubble).toHaveTextContent("5");
    fireEvent.click(bubble);
    expect(usePanelStore.getState()).toMatchObject({
      threadDocksPanelOpen: true,
      threadDocksFocus: "images",
      rightPanelTab: "docks",
    });
    expect(document.querySelector(".poracode-image-lightbox")).toBeNull();
    const activeBubble = screen.getByRole("button", { name: "Hide Media" });
    expect(activeBubble).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(activeBubble);
    expect(usePanelStore.getState().threadDocksPanelOpen).toBe(false);
    expect(usePanelStore.getState().threadDocksFocus).toBeNull();
  });

  it("updates after an item completes without replacing the thread item index", () => {
    seedThreadWithImages("t-gallery");
    const itemsById = useAppStore.getState().runtimeItemsByIdByThread["t-gallery"]!;
    itemsById.a1 = {
      id: "a1",
      type: "assistant_message",
      state: "started",
      payload: { content: [] },
      streams: { assistant_text: "![streaming](https://example.test/streaming.png)" },
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { "t-gallery": ["a1"] },
      runtimeItemsByIdByThread: { "t-gallery": itemsById },
      runtimeStructuralVersionByThread: { "t-gallery": 1 },
    });
    render(<ThreadImagesBubble threadId="t-gallery" />);
    expect(screen.queryByRole("button", { name: "Show media" })).not.toBeInTheDocument();

    act(() => {
      itemsById.a1!.state = "completed";
      itemsById.a1!.streams.assistant_text = "![done](https://example.test/done.png)";
      useAppStore.setState({
        runtimeItemsByIdByThread: { "t-gallery": itemsById },
        runtimeStructuralVersionByThread: { "t-gallery": 2 },
      });
    });

    expect(screen.getByRole("button", { name: "Show media" })).toHaveTextContent("1");
  });

  it("re-resolves unchanged remote history when the desktop reconnects", () => {
    seedThreadWithImages("t-gallery");
    const imageUrl = (path: string) =>
      useRemoteServersStore.getState().runtime["desktop-1"]?.status === "online"
        ? `https://desktop.test/image?path=${encodeURIComponent(path)}`
        : "";
    const thread = useAppStore.getState().threads[0]!;
    useAppStore.setState({
      threads: [{ ...thread, remoteServerId: "desktop-1" }],
      runtimeItemIdsByThread: { "t-gallery": ["u1"] },
      runtimeStructuralVersionByThread: { "t-gallery": 1 },
    });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote",
          endpoint: "https://desktop.test",
          accessToken: "test-token",
          scopes: [],
        },
      ],
      runtime: {
        "desktop-1": { status: "offline", projects: [], threads: [] },
      },
      localImageUrl: (_desktopId, path) => imageUrl(path),
      imageReadinessFor: () => ({
        resolveRef: () => "",
        subscribeRef: () => () => undefined,
        requestRef: () => undefined,
        resolvePath: imageUrl,
        subscribePath: () => () => undefined,
        requestPath: () => undefined,
      }),
    });
    render(<ThreadImagesBubble threadId="t-gallery" />);
    // The bubble counts the pending image without fetching it; the count is
    // unchanged once the desktop reconnects and the image becomes ready.
    expect(screen.getByRole("button", { name: "Show media" })).toHaveTextContent("1");

    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          "desktop-1": { status: "online", projects: [], threads: [] },
        },
      });
    });

    expect(screen.getByRole("button", { name: "Show media" })).toHaveTextContent("1");
  });

  it("counts a pending attachment without requesting its bytes", () => {
    seedThreadWithImages("t-gallery");
    const thread = useAppStore.getState().threads[0]!;
    useAppStore.setState({
      threads: [{ ...thread, remoteServerId: "desktop-1" }],
      runtimeItemIdsByThread: { "t-gallery": ["u1"] },
      runtimeStructuralVersionByThread: { "t-gallery": 1 },
    });
    let url = "";
    const listeners = new Set<() => void>();
    const requestPath = vi.fn<() => void>(() => undefined);
    const requestRef = vi.fn<() => void>(() => undefined);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote",
          endpoint: "https://desktop.test",
          accessToken: "test-token",
          scopes: [],
        },
      ],
      localImageUrl: () => url,
      imageReadinessFor: () => ({
        resolveRef: () => "",
        subscribeRef: () => () => undefined,
        requestRef,
        resolvePath: () => url,
        subscribePath: (_path, listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        requestPath,
      }),
    });
    render(<ThreadImagesBubble threadId="t-gallery" />);
    // Counted from the pending coordinate, with no background fetch started:
    // fetching the whole history from this bubble starved visible cards.
    expect(screen.getByRole("button", { name: "Show media" })).toHaveTextContent("1");
    expect(requestPath).not.toHaveBeenCalled();
    expect(requestRef).not.toHaveBeenCalled();

    act(() => {
      url = "blob:direct-attachment";
      for (const listener of listeners) listener();
    });
    expect(screen.getByRole("button", { name: "Show media" })).toHaveTextContent("1");
  });

  it("follows the persisted dock order alongside files & artifacts and informational bubbles", () => {
    seedThreadWithImages("t-gallery");
    const existing = useAppStore.getState().runtimeItemsByIdByThread["t-gallery"]!;
    useAppStore.setState({
      runtimeItemIdsByThread: { "t-gallery": ["u1", "a1", "t1", "doc"] },
      runtimeItemsByIdByThread: {
        "t-gallery": {
          ...existing,
          doc: {
            id: "doc",
            type: "assistant_message",
            state: "completed",
            payload: { content: [{ kind: "text", text: "[Report](report.pdf)" }] },
            streams: {},
          },
        },
      },
      runtimeStructuralVersionByThread: { "t-gallery": 1 },
      runtimeBackgroundTasksByThread: {
        "t-gallery": [{ taskId: "task-1", kind: "command", description: "pnpm test" }],
      },
    });
    useSharedSettings.setState({
      threadDocksOrder: ["images", "backgroundTasks", "artifacts", "goal", "plan", "agents"],
    });
    const { container } = render(
      <ThreadDockBubbles
        threadId="t-gallery"
        summary={{ goal: null, plan: null, agentCount: 0, backgroundTaskCount: 1 }}
      />,
    );

    expect(
      [...container.querySelectorAll("button")].map((button) =>
        button.hasAttribute("data-images-bubble")
          ? "images"
          : button.getAttribute("data-dock-bubble"),
      ),
    ).toEqual(["images", "backgroundTasks", "artifacts"]);
  });
});

describe("ThreadImagesDock", () => {
  beforeEach(() => {
    closeImageLightbox();
    useAppStore.setState({
      threads: [],
      projects: [],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      localImageUrl: defaultLocalImageUrl,
      imageReadinessFor: defaultImageReadinessFor,
    });
  });

  afterEach(() => {
    closeImageLightbox();
    cleanup();
  });

  it("renders an expanded lazy 2-row mosaic where every tile opens the gallery", () => {
    seedThreadWithImages("t-gallery");
    const { container } = render(
      <>
        <ThreadImagesDock gallery={getThreadGalleryImages("t-gallery")} />
        <ImageLightboxHost />
      </>,
    );
    const region = screen.getByRole("region", { name: "Media" });
    expect(region).toHaveTextContent("4");
    const header = screen.getByRole("button", { name: "Media" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Collapse media" })).toBeInTheDocument();
    const tiles = screen.getAllByRole("button", { name: /Open image \d+ of 4/ });
    expect(tiles.length).toBe(4);
    const imgs = container.querySelectorAll('img[loading="lazy"]');
    expect(imgs.length).toBe(4);
    for (const img of imgs) {
      expect(img.getAttribute("decoding")).toBe("async");
      expect(img).toHaveClass(
        "rounded-[inherit]",
        "object-cover",
        "[image-rendering:high-quality]",
      );
      expect(img.className).not.toContain("group-hover:scale");
    }
    expect(tiles[0]).toHaveClass("h-24", "w-40", "rounded-xl");
    expect(tiles[0]!.querySelector("span[aria-hidden='true']")).toHaveClass(
      "group-hover:bg-foreground/10",
    );
    fireEvent.click(tiles[2]!);
    expect(document.querySelector(".poracode-image-lightbox")).not.toBeNull();
    expect(document.querySelector(".poracode-image-lightbox__counter")).toHaveTextContent("3 / 4");
  });

  it("renders video tiles in Media and opens them for playback in the lightbox", () => {
    seedThreadWithImages("t-media");
    const existing = useAppStore.getState().runtimeItemsByIdByThread["t-media"]!;
    useAppStore.setState({
      runtimeItemIdsByThread: { "t-media": ["u1", "a1", "t1", "v1"] },
      runtimeItemsByIdByThread: {
        "t-media": {
          ...existing,
          v1: {
            id: "v1",
            type: "assistant_message",
            state: "completed",
            payload: {
              content: [
                { kind: "text", text: "[Walkthrough](https://example.com/walkthrough.mp4)" },
              ],
            },
            streams: {},
          },
        },
      },
      runtimeStructuralVersionByThread: { "t-media": 1 },
    });
    const gallery = getThreadGalleryImages("t-media");
    const videos = collectThreadVideos([
      existing.u1!,
      existing.a1!,
      existing.t1!,
      useAppStore.getState().runtimeItemsByIdByThread["t-media"]!.v1!,
    ]);
    render(
      <>
        <ThreadImagesDock gallery={gallery} videos={videos} threadId="t-media" />
        <ImageLightboxHost />
      </>,
    );

    expect(screen.getByRole("region", { name: "Media" })).toHaveTextContent("5");
    const videoTile = screen.getByRole("button", { name: "Open video 1 of 1: Walkthrough" });
    fireEvent.click(videoTile);

    const dialog = screen.getByRole("dialog", { name: "Walkthrough" });
    const player = dialog.querySelector("video");
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute("src", "https://example.com/walkthrough.mp4");
    expect(dialog.querySelector(".poracode-image-lightbox__zoom")).toBeNull();
    expect(dialog.querySelector(".poracode-image-lightbox__counter")).toHaveTextContent("5 / 5");

    act(() => {
      const state = useAppStore.getState();
      useAppStore.setState({
        runtimeItemIdsByThread: { "t-media": [...state.runtimeItemIdsByThread["t-media"]!, "new"] },
        runtimeItemsByIdByThread: {
          "t-media": {
            ...state.runtimeItemsByIdByThread["t-media"],
            new: {
              id: "new",
              type: "assistant_message",
              state: "completed",
              payload: {
                content: [
                  {
                    kind: "text",
                    text: "![New](https://example.com/new.png) [New clip](https://example.com/new.mp4)",
                  },
                ],
              },
              streams: {},
            },
          },
        },
        runtimeStructuralVersionByThread: { "t-media": 2 },
      });
    });
    expect(screen.getByRole("dialog", { name: "Walkthrough" }).querySelector("video")).toBe(player);
    expect(dialog.querySelector(".poracode-image-lightbox__counter")).toHaveTextContent("7 / 7");
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByRole("dialog", { name: "New clip" }).querySelector("video")).toHaveAttribute(
      "src",
      "https://example.com/new.mp4",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog", { name: "Walkthrough" })).toBeInTheDocument();
  });

  it("keeps a playing video grant across gallery updates and releases it when closed", async () => {
    seedThreadWithImages("t-grant");
    const release = vi.fn<EditorMediaSource["release"]>(async () => {});
    const source = {
      url: "https://host.test/media/recording",
      ticket: "video-ticket",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      sizeBytes: 100,
      modifiedAtMs: 0,
      contentType: "video/webm",
      release,
      renew: vi.fn<EditorMediaSource["renew"]>(),
      readImageBytes: vi.fn<EditorMediaSource["readImageBytes"]>(),
    };
    vi.mocked(createEditorMediaSource).mockClear().mockResolvedValue(source);
    const videoItem = {
      id: "video",
      type: "assistant_message" as const,
      state: "completed" as const,
      payload: { content: [{ kind: "text" as const, text: "[Recording](recording.webm)" }] },
      streams: {},
    };
    useAppStore.setState((state) => ({
      threads: state.threads.map((thread) => ({ ...thread, worktreePath: "E:/work/branch" })),
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
    }));
    useAppStore.getState().hydrateThreadRuntimeItems("t-grant", [videoItem]);
    render(
      <>
        <ThreadImagesDock
          gallery={[]}
          videos={collectThreadVideos([videoItem], undefined, { projectRoot: "E:/work/branch" })}
          threadId="t-grant"
        />
        <ImageLightboxHost />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open video 1 of 1: Recording" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog").querySelector("video")).toHaveAttribute("src", source.url),
    );
    const player = screen.getByRole("dialog").querySelector("video");
    expect(createEditorMediaSource).toHaveBeenCalledTimes(1);

    await act(async () => {
      useAppStore.getState().prependThreadRuntimeItems("t-grant", [
        {
          id: "image",
          type: "assistant_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "![New](https://example.com/new.png)" }] },
          streams: {},
        },
      ]);
    });
    expect(screen.getByRole("dialog").querySelector("video")).toBe(player);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(createEditorMediaSource).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it("starts expanded, toggles the mosaic from its header, and keeps a user collapse across gallery updates", () => {
    seedThreadWithImages("t-gallery");
    const { rerender } = render(<ThreadImagesDock gallery={getThreadGalleryImages("t-gallery")} />);

    const header = screen.getByRole("button", { name: "Media" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: /Open image \d+ of 4/ })).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Collapse media" }));
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Open image \d+ of 4/ })).not.toBeInTheDocument();

    // A newer gallery image must not reopen a section the user collapsed.
    rerender(
      <ThreadImagesDock
        gallery={[
          { src: "data:image/png;base64,CCC", alt: "newer" },
          ...getThreadGalleryImages("t-gallery"),
        ]}
      />,
    );
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Open image \d+ of 5/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand media" }));
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: /Open image \d+ of 5/ })).toHaveLength(5);
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves existing thumbnail elements when a newer image arrives", () => {
    const first = { src: "data:image/png;base64,AAA", alt: "first" };
    const second = { src: "data:image/png;base64,BBB", alt: "second" };
    const newer = { src: "data:image/png;base64,CCC", alt: "newer" };
    const { container, rerender } = render(<ThreadImagesDock gallery={[first, second]} />);
    const firstElement = container.querySelector('img[alt="first"]');

    rerender(<ThreadImagesDock gallery={[newer, first, second]} />);

    expect(container.querySelector('img[alt="first"]')).toBe(firstElement);
  });

  it("stays hidden when the thread holds no media", () => {
    render(<ThreadImagesDock gallery={[]} />);
    expect(screen.queryByRole("region", { name: "Media" })).not.toBeInTheDocument();
  });
});

describe("ThreadArtifactsBubble and ThreadArtifactsDock", () => {
  beforeEach(() => {
    useAppStore.setState({
      threads: [],
      projects: [],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    });
    usePanelStore.setState({
      threadDocksPanelOpen: false,
      threadDocksFocus: null,
      rightPanelTab: "git",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens files-only thread info and resolves bare output names through the transcript file actions", async () => {
    seedThreadWithImages("t-files");
    useAppStore.setState({
      runtimeItemIdsByThread: { "t-files": ["output"] },
      runtimeItemsByIdByThread: {
        "t-files": {
          output: {
            id: "output",
            type: "assistant_message",
            state: "completed",
            streams: {},
            payload: { content: [{ kind: "text", text: "[Report](report.pdf)" }] },
          },
        },
      },
    });
    const searchProjectFiles = vi.fn<PoracodeBridge["searchProjectFiles"]>(async () => ({
      totalIndexed: 1,
      entries: [{ type: "file", name: "report.pdf", path: "output/report.pdf" }],
    }));
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: { ...window.poracode, searchProjectFiles },
    });
    vi.mocked(openFileInEditor).mockClear();
    render(
      <>
        <ThreadArtifactsBubble threadId="t-files" />
        <ThreadArtifactsDock
          threadId="t-files"
          artifacts={[{ target: "report.pdf", name: "report.pdf", external: false }]}
        />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show files & artifacts" }));
    expect(usePanelStore.getState()).toMatchObject({
      threadDocksPanelOpen: true,
      threadDocksFocus: "artifacts",
    });
    fireEvent.click(screen.getByRole("button", { name: /report\.pdf/ }));
    await vi.waitFor(() =>
      expect(openFileInEditor).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: "project-1" }),
        undefined,
        undefined,
        "output/report.pdf",
        undefined,
      ),
    );
    expect(searchProjectFiles).toHaveBeenCalledWith({
      projectLocation: { kind: "windows", path: "E:\\work\\p" },
      query: "report.pdf",
      limit: 5,
    });
  });

  it("shows the first 5 files and artifacts with a Show more toggle when more exist", () => {
    const artifacts = Array.from({ length: 7 }, (_, index) => ({
      target: `src/file-${index + 1}.ts`,
      name: `file-${index + 1}.ts`,
      external: false,
    }));

    const { rerender } = render(
      <ThreadArtifactsDock threadId="t-files" artifacts={artifacts.slice(0, 5)} />,
    );
    expect(screen.getByRole("region", { name: "Files & artifacts" })).toHaveTextContent("5");
    expect(screen.getByText("file-5.ts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show/ })).not.toBeInTheDocument();

    rerender(<ThreadArtifactsDock threadId="t-files" artifacts={artifacts} />);
    expect(screen.getByRole("region", { name: "Files & artifacts" })).toHaveTextContent("7");
    expect(screen.getByText("file-5.ts")).toBeInTheDocument();
    expect(screen.queryByText("file-6.ts")).not.toBeInTheDocument();

    const showMore = screen.getByRole("button", { name: "Show 2 more" });
    expect(showMore).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showMore);

    expect(screen.getByText("file-6.ts")).toBeInTheDocument();
    expect(screen.getByText("file-7.ts")).toBeInTheDocument();
    const showFewer = screen.getByRole("button", { name: "Show fewer" });
    expect(showFewer).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(showFewer);
    expect(screen.queryByText("file-6.ts")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 2 more" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("stays hidden when the thread holds no files or artifacts", () => {
    render(<ThreadArtifactsDock artifacts={[]} />);
    expect(screen.queryByRole("region", { name: "Files & artifacts" })).not.toBeInTheDocument();
  });
});
