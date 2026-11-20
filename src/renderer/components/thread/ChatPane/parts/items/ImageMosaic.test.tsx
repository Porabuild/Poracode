import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { ImageGroup } from "./ImageGroup";
import { estimateImageMosaicHeightPx, ImageMosaic } from "./ImageMosaic";
import type { ImageViewSource } from "./imageViewSource";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
  it("renders a single image as a standalone card without a mosaic wrapper", () => {
    const { container } = render(
      <AppProvider>
        <ImageMosaic sources={[makeSource(1)]} />
      </AppProvider>,
    );
    expect(container.querySelector("[data-poracode-image-mosaic='true']")).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it.each([2, 3, 4, 5, 6])("renders %d images in an adaptive mosaic grid", (count) => {
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

  it("estimates fixed mosaic heights matching the responsive Tailwind layout", () => {
    expect(estimateImageMosaicHeightPx(1, 1024, 16)).toBeUndefined();
    expect(estimateImageMosaicHeightPx(2, 1024, 16)).toBe(208); // h-52 (13rem)
    expect(estimateImageMosaicHeightPx(2, 400, 16)).toBe(176); // h-44 (11rem)
    expect(estimateImageMosaicHeightPx(3, 1024, 16)).toBe(288); // h-72 (18rem)
    expect(estimateImageMosaicHeightPx(4, 1024, 16)).toBe(358); // 2 * h-44 + gap-1.5
    expect(estimateImageMosaicHeightPx(5, 1024, 16)).toBe(326); // h-44 + h-36 + gap-1.5
    expect(estimateImageMosaicHeightPx(8, 1024, 16)).toBe(294); // 2 * h-36 + gap-1.5
  });
});

describe("ImageGroup", () => {
  const threadId = "image-group-test-thread";

  afterEach(() => {
    useAppStore.setState((state) => {
      const nextIds = { ...state.runtimeItemIdsByThread };
      const nextById = { ...state.runtimeItemsByIdByThread };
      delete nextIds[threadId];
      delete nextById[threadId];
      return { runtimeItemIdsByThread: nextIds, runtimeItemsByIdByThread: nextById };
    });
  });

  it("combines consecutive image tool-call items into a single mosaic", () => {
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
    };
    useAppStore.setState((state) => ({
      runtimeItemIdsByThread: { ...state.runtimeItemIdsByThread, [threadId]: ["img1", "img2"] },
      runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread, [threadId]: items },
    }));

    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={{ threadId }}>
          <ImageGroup threadId={threadId} itemIds={["img1", "img2"]} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    const mosaic = container.querySelector("[data-poracode-image-mosaic='true']");
    expect(mosaic).toHaveAttribute("data-mosaic-count", "2");
    expect(screen.getAllByRole("img")).toHaveLength(2);
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
    useAppStore.setState((state) => ({
      runtimeItemIdsByThread: {
        ...state.runtimeItemIdsByThread,
        [threadId]: ["img1", "img2", "err1"],
      },
      runtimeItemsByIdByThread: { ...state.runtimeItemsByIdByThread, [threadId]: items },
    }));

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
