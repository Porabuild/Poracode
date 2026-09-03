import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  closeImageLightbox,
  ImageLightboxHost,
} from "@/renderer/components/composer/ImageLightbox";
import { ThreadImagesBubble } from "./ThreadImagesBubble";
import { ThreadImagesDock } from "./ThreadImagesDock";
import { getThreadGalleryImages } from "./useThreadGalleryImages";

const defaultLocalImageUrl = useRemoteServersStore.getState().localImageUrl;

vi.mock("@heroui/react", () => {
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div role="tooltip">{props.children}</div>,
  });
  return { Tooltip };
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
    });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      localImageUrl: defaultLocalImageUrl,
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

  it("stays hidden when the thread holds no image", () => {
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
    expect(screen.queryByRole("button", { name: "Show images" })).not.toBeInTheDocument();
  });

  it("shows the thread image count and toggles Thread info focused on images", () => {
    seedThreadWithImages("t-gallery");
    render(
      <>
        <ThreadImagesBubble threadId="t-gallery" />
        <ImageLightboxHost />
      </>,
    );
    const bubble = screen.getByRole("button", { name: "Show images" });
    // user attachment + markdown + assistant block + tool image = 4
    expect(bubble).toHaveClass("poracode-floating-chrome--bubble");
    expect(bubble).toHaveTextContent("4");
    fireEvent.click(bubble);
    expect(usePanelStore.getState()).toMatchObject({
      threadDocksPanelOpen: true,
      threadDocksFocus: "images",
      rightPanelTab: "docks",
    });
    expect(document.querySelector(".poracode-image-lightbox")).toBeNull();
    const activeBubble = screen.getByRole("button", { name: "Hide Images" });
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
    expect(screen.queryByRole("button", { name: "Show images" })).not.toBeInTheDocument();

    act(() => {
      itemsById.a1!.state = "completed";
      itemsById.a1!.streams.assistant_text = "![done](https://example.test/done.png)";
      useAppStore.setState({
        runtimeItemsByIdByThread: { "t-gallery": itemsById },
        runtimeStructuralVersionByThread: { "t-gallery": 2 },
      });
    });

    expect(screen.getByRole("button", { name: "Show images" })).toHaveTextContent("1");
  });

  it("re-resolves unchanged remote history when the desktop reconnects", () => {
    seedThreadWithImages("t-gallery");
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
      localImageUrl: (desktopId, path) =>
        useRemoteServersStore.getState().runtime[desktopId]?.status === "online"
          ? `https://desktop.test/image?path=${encodeURIComponent(path)}`
          : "",
    });
    render(<ThreadImagesBubble threadId="t-gallery" />);
    expect(screen.queryByRole("button", { name: "Show images" })).not.toBeInTheDocument();

    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          "desktop-1": { status: "online", projects: [], threads: [] },
        },
      });
    });

    expect(screen.getByRole("button", { name: "Show images" })).toHaveTextContent("1");
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
    });
  });

  afterEach(() => {
    closeImageLightbox();
    cleanup();
  });

  it("renders a lazy 2-row mosaic where every tile opens the gallery", () => {
    seedThreadWithImages("t-gallery");
    const { container } = render(
      <>
        <ThreadImagesDock gallery={getThreadGalleryImages("t-gallery")} />
        <ImageLightboxHost />
      </>,
    );
    const region = screen.getByRole("region", { name: "Images" });
    expect(region).toHaveTextContent("4");
    const tiles = screen.getAllByRole("button", { name: /Open image \d+ of 4/ });
    expect(tiles.length).toBe(4);
    const imgs = container.querySelectorAll('img[loading="lazy"]');
    expect(imgs.length).toBe(4);
    for (const img of imgs) {
      expect(img.getAttribute("decoding")).toBe("async");
    }
    fireEvent.click(tiles[2]!);
    expect(document.querySelector(".poracode-image-lightbox")).not.toBeNull();
    expect(document.querySelector(".poracode-image-lightbox__counter")).toHaveTextContent("3 / 4");
  });

  it("stays hidden when the thread holds no image", () => {
    render(<ThreadImagesDock gallery={[]} />);
    expect(screen.queryByRole("region", { name: "Images" })).not.toBeInTheDocument();
  });
});
