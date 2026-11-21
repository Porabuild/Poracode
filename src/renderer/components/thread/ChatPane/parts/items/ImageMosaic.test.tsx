import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import {
  closeImageLightbox,
  ImageLightboxHost,
} from "@/renderer/components/composer/ImageLightbox";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { ImageGroup } from "./ImageGroup";
import { estimateImageMosaicHeightPx, ImageMosaic } from "./ImageMosaic";
import type { ImageViewSource } from "./imageViewSource";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}

function makeSource(index: number): ImageViewSource {
  return {
    src: `data:image/png;base64,${PNG_BASE64}#${index}`,
    mime: "image/png",
    extension: "png",
    fileName: `shot-${index}.png`,
    alt: `Shot ${index}`,
  };
}

describe("ImageMosaic", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    closeImageLightbox();
  });

  it("renders a single image as a standalone card without a mosaic wrapper", () => {
    const { container } = render(
      <AppProvider>
        <ImageMosaic sources={[makeSource(1)]} />
      </AppProvider>,
    );
    expect(container.querySelector("[data-poracode-image-mosaic='true']")).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it.each([2, 3, 4, 5, 6])("renders %d images in a uniform mosaic grid", (count) => {
    const sources = Array.from({ length: count }, (_, idx) => makeSource(idx + 1));
    const { container } = render(
      <AppProvider>
        <ImageMosaic sources={sources} />
      </AppProvider>,
    );
    const mosaic = container.querySelector("[data-poracode-image-mosaic='true']");
    expect(mosaic).not.toBeNull();
    expect(mosaic).toHaveAttribute("data-mosaic-count", String(count));
    expect(screen.getAllByRole("img")).toHaveLength(count);
    expect(container.querySelector("[data-poracode-mosaic-overflow='true']")).toBeNull();
  });

  it("caps visible tiles at 6 and shows a +N overflow badge on the 6th tile", () => {
    const sources = Array.from({ length: 8 }, (_, idx) => makeSource(idx + 1));
    const { container } = render(
      <AppProvider>
        <ImageMosaic sources={sources} />
      </AppProvider>,
    );
    const mosaic = container.querySelector("[data-poracode-image-mosaic='true']");
    expect(mosaic).toHaveAttribute("data-mosaic-count", "8");
    expect(screen.getAllByRole("img")).toHaveLength(6);
    expect(container.querySelector("[data-poracode-mosaic-overflow='true']")).toHaveTextContent(
      "+2",
    );
    expect(
      screen.getByRole("button", { name: "Open image preview (+2 more)" }),
    ).toBeInTheDocument();
    // The overflow tile suppresses the corner action toolbar so clicking it
    // cleanly opens the lightbox.
    expect(container.querySelectorAll(".poracode-image-action-toolbar")).toHaveLength(5);
  });

  it("shows a hover mosaic popover for hidden overflow images and opens the clicked image", () => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const sources = Array.from({ length: 9 }, (_, idx) => makeSource(idx + 1));
    render(
      <AppProvider>
        <ImageMosaic sources={sources} />
        <ImageLightboxHost />
      </AppProvider>,
    );

    const overflowButton = screen.getByRole("button", { name: "Open image preview (+3 more)" });
    const overflowAnchor = overflowButton.closest("div")!;

    // Touch pointers never open the hover popover.
    fireEvent.pointerEnter(overflowAnchor, { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).toBeNull();

    // Mouse hover opens the popover after the 140ms delay.
    fireEvent.pointerEnter(overflowAnchor, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(50);
    });

    const popover = document.querySelector(
      "[data-poracode-mosaic-overflow-popover='true']",
    ) as HTMLElement | null;
    expect(popover).not.toBeNull();
    expect(
      within(popover!)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["Shot 7", "Shot 8", "Shot 9"]);
    // Compact popover tiles omit the corner action toolbar.
    expect(popover!.querySelectorAll(".poracode-image-action-toolbar")).toHaveLength(0);

    // Moving the pointer from the anchor onto the popover cancels closing.
    fireEvent.pointerLeave(overflowAnchor, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerEnter(popover!, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).not.toBeNull();

    // Clicking a hidden image tile closes the popover and opens that image in the lightbox.
    const shot8Button = within(popover!).getByAltText("Shot 8").closest("button")!;
    fireEvent.click(shot8Button);
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Shot 8" })).toBeInTheDocument();
  });

  it("closes the overflow popover on pointer leave and Escape, and caps popover tiles at 9", () => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const sources = Array.from({ length: 17 }, (_, idx) => makeSource(idx + 1));
    render(
      <AppProvider>
        <ImageMosaic sources={sources} />
      </AppProvider>,
    );

    const overflowAnchor = screen
      .getByRole("button", { name: "Open image preview (+11 more)" })
      .closest("div")!;

    fireEvent.pointerEnter(overflowAnchor, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const popover = document.querySelector(
      "[data-poracode-mosaic-overflow-popover='true']",
    ) as HTMLElement | null;
    expect(popover).not.toBeNull();
    expect(within(popover!).getAllByRole("img")).toHaveLength(9);
    expect(
      popover!.querySelector("[data-poracode-mosaic-popover-overflow='true']"),
    ).toHaveTextContent("+2");

    // Escape closes immediately.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).toBeNull();

    // Reopen and verify pointer leave closes after the grace delay.
    fireEvent.pointerEnter(overflowAnchor, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).not.toBeNull();

    fireEvent.pointerLeave(overflowAnchor, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector("[data-poracode-mosaic-overflow-popover='true']")).toBeNull();
  });

  it("repositions and widens an open overflow popover when additional overflow images arrive", () => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const initialSources = Array.from({ length: 7 }, (_, idx) => makeSource(idx + 1));
    const view = render(
      <AppProvider>
        <ImageMosaic sources={initialSources} />
      </AppProvider>,
    );

    const overflowAnchor = screen
      .getByRole("button", { name: "Open image preview (+1 more)" })
      .closest("div")!;

    fireEvent.pointerEnter(overflowAnchor, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    const popover = document.querySelector(
      "[data-poracode-mosaic-overflow-popover='true']",
    ) as HTMLElement | null;
    expect(popover).not.toBeNull();
    expect(popover!.style.width).toBe("140px");

    const expandedSources = Array.from({ length: 10 }, (_, idx) => makeSource(idx + 1));
    view.rerender(
      <AppProvider>
        <ImageMosaic sources={expandedSources} />
      </AppProvider>,
    );

    expect(popover!.style.width).toBe("352px");
    expect(within(popover!).getAllByRole("img")).toHaveLength(4);
  });

  it("keeps existing tile img DOM nodes mounted across 1 -> 2 -> 3 -> 4 arrivals", () => {
    const s1 = makeSource(1);
    const s2 = makeSource(2);
    const s3 = makeSource(3);
    const s4 = makeSource(4);
    const view = render(
      <AppProvider>
        <ImageMosaic sources={[s1]} />
      </AppProvider>,
    );
    const firstImg = screen.getAllByRole("img")[0]!;

    view.rerender(
      <AppProvider>
        <ImageMosaic sources={[s1, s2]} />
      </AppProvider>,
    );
    const imgsAt2 = screen.getAllByRole("img");
    expect(imgsAt2[0]).toBe(firstImg);
    const secondImg = imgsAt2[1]!;

    view.rerender(
      <AppProvider>
        <ImageMosaic sources={[s1, s2, s3]} />
      </AppProvider>,
    );
    const imgsAt3 = screen.getAllByRole("img");
    expect(imgsAt3[0]).toBe(firstImg);
    expect(imgsAt3[1]).toBe(secondImg);

    view.rerender(
      <AppProvider>
        <ImageMosaic sources={[s1, s2, s3, s4]} />
      </AppProvider>,
    );
    const imgsAt4 = screen.getAllByRole("img");
    expect(imgsAt4[0]).toBe(firstImg);
    expect(imgsAt4[1]).toBe(secondImg);
  });

  it("renders pending skeleton tiles alongside resolved images up to the 6-tile cap", () => {
    const { container } = render(
      <AppProvider>
        <ImageMosaic sources={[makeSource(1)]} pendingTileCount={2} />
      </AppProvider>,
    );
    const mosaic = container.querySelector("[data-poracode-image-mosaic='true']");
    expect(mosaic).toHaveAttribute("data-mosaic-count", "3");
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(container.querySelectorAll("[data-poracode-mosaic-pending='true']")).toHaveLength(2);
  });

  it("estimates monotonic fixed mosaic heights matching the uniform responsive grid", () => {
    expect(estimateImageMosaicHeightPx(1, 1024, 16)).toBeUndefined();
    // Desktop (>= 640px): 3 columns of sm:h-40 (10rem = 160px)
    expect(estimateImageMosaicHeightPx(2, 1024, 16)).toBe(160);
    expect(estimateImageMosaicHeightPx(3, 1024, 16)).toBe(160);
    expect(estimateImageMosaicHeightPx(4, 1024, 16)).toBe(326); // 2 * 160 + 6
    expect(estimateImageMosaicHeightPx(5, 1024, 16)).toBe(326);
    expect(estimateImageMosaicHeightPx(6, 1024, 16)).toBe(326);
    expect(estimateImageMosaicHeightPx(8, 1024, 16)).toBe(326);
    // Mobile (< 640px): 2 columns of h-32 (8rem = 128px)
    expect(estimateImageMosaicHeightPx(2, 400, 16)).toBe(128);
    expect(estimateImageMosaicHeightPx(3, 400, 16)).toBe(262); // 2 * 128 + 6
    expect(estimateImageMosaicHeightPx(4, 400, 16)).toBe(262);
    expect(estimateImageMosaicHeightPx(5, 400, 16)).toBe(396); // 3 * 128 + 12
    expect(estimateImageMosaicHeightPx(8, 400, 16)).toBe(396);
  });
});

describe("ImageGroup", () => {
  const threadId = "image-group-test-thread";

  afterEach(() => {
    act(() => {
      useAppStore.setState((state) => {
        const nextIds = { ...state.runtimeItemIdsByThread };
        const nextById = { ...state.runtimeItemsByIdByThread };
        delete nextIds[threadId];
        delete nextById[threadId];
        return { runtimeItemIdsByThread: nextIds, runtimeItemsByIdByThread: nextById };
      });
    });
  });

  it("combines consecutive image tool-call items into a single mosaic without remounting tile 0", () => {
    const img1: RuntimeChatItem = {
      id: "img1",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "read_file",
        kind: "read",
        args: { path: "/tmp/shot-1.png" },
        status: "success",
        images: [`data:image/png;base64,${PNG_BASE64}`],
      },
      streams: {},
    };
    const img2: RuntimeChatItem = {
      id: "img2",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "read_file",
        kind: "read",
        args: { path: "/tmp/shot-2.png" },
        status: "success",
        images: [`data:image/png;base64,${PNG_BASE64}`],
      },
      streams: {},
    };
    act(() => {
      useAppStore.setState((state) => ({
        runtimeItemIdsByThread: { ...state.runtimeItemIdsByThread, [threadId]: ["img1"] },
        runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread, [threadId]: { img1 } },
      }));
    });

    const view = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId }}>
          <ImageGroup threadId={threadId} itemIds={["img1"]} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(view.container.querySelector("[data-poracode-image-mosaic='true']")).toBeNull();
    const firstImg = screen.getAllByRole("img")[0]!;

    act(() => {
      useAppStore.setState((state) => ({
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: ["img1", "img2"],
        },
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: { img1, img2 },
        },
      }));
    });
    view.rerender(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId }}>
          <ImageGroup threadId={threadId} itemIds={["img1", "img2"]} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const mosaic = view.container.querySelector("[data-poracode-image-mosaic='true']");
    expect(mosaic).toHaveAttribute("data-mosaic-count", "2");
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toBe(firstImg);
  });

  it("renders adjacent in-progress image_view items as pending mosaic slots", () => {
    const items: Record<string, RuntimeChatItem> = {
      img1: {
        id: "img1",
        type: "image_view",
        state: "completed",
        payload: {
          name: "imageGeneration",
          status: "success",
          images: [`data:image/png;base64,${PNG_BASE64}`],
        },
        streams: {},
      },
      img2: {
        id: "img2",
        type: "image_view",
        state: "started",
        payload: {
          name: "imageGeneration",
          status: "running",
        },
        streams: {},
      },
    };
    act(() => {
      useAppStore.setState((state) => ({
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: ["img1", "img2"],
        },
        runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread, [threadId]: items },
      }));
    });

    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId }}>
          <ImageGroup threadId={threadId} itemIds={["img1", "img2"]} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(container.querySelector("[data-poracode-image-mosaic='true']")).toHaveAttribute(
      "data-mosaic-count",
      "2",
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(container.querySelectorAll("[data-poracode-mosaic-pending='true']")).toHaveLength(1);
  });

  it("renders errored items as fallback tool rows instead of dropping them", () => {
    const items: Record<string, RuntimeChatItem> = {
      img1: {
        id: "img1",
        type: "tool_call",
        state: "completed",
        payload: {
          name: "read_file",
          kind: "read",
          args: { path: "/tmp/shot-1.png" },
          status: "success",
          images: [`data:image/png;base64,${PNG_BASE64}`],
        },
        streams: {},
      },
      img2: {
        id: "img2",
        type: "tool_call",
        state: "completed",
        payload: {
          name: "read_file",
          kind: "read",
          args: { path: "/tmp/shot-2.png" },
          status: "success",
          images: [`data:image/png;base64,${PNG_BASE64}`],
        },
        streams: {},
      },
      err1: {
        id: "err1",
        type: "tool_call",
        state: "completed",
        payload: {
          name: "read_file",
          kind: "read",
          args: { path: "/tmp/missing.png" },
          status: "error",
          result: "ENOENT",
        },
        streams: {},
      },
    };
    act(() => {
      useAppStore.setState((state) => ({
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: ["img1", "img2", "err1"],
        },
        runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread, [threadId]: items },
      }));
    });

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId }}>
          <ImageGroup threadId={threadId} itemIds={["img1", "img2", "err1"]} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText(/missing\.png/)).toBeInTheDocument();
  });
});
