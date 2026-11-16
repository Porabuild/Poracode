import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { clearInlineImageDimensionsCache } from "./chatImageClass";
import { ImageCard } from "./ImageCard";
import type { ImageViewSource } from "./imageViewSource";

vi.mock("../../chatPaneActionsContext", () => ({
  useChatPaneActions: () => null,
}));

const createdUrls: string[] = [];

async function makeCanvasBlobUrl(width: number, height: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("toBlob failed"));
    }, "image/png");
  });
  const url = URL.createObjectURL(blob);
  createdUrls.push(url);
  return url;
}

afterEach(() => {
  cleanup();
  clearInlineImageDimensionsCache();
  while (createdUrls.length > 0) {
    const url = createdUrls.pop();
    if (url) URL.revokeObjectURL(url);
  }
});

describe("ImageCard layout in Chromium", () => {
  it("wraps tightly around EXIF-oriented landscape pixels without portrait letterboxing", async () => {
    const blobUrl = await makeCanvasBlobUrl(960, 667);
    const source: ImageViewSource = {
      src: blobUrl,
      mime: "image/webp",
      extension: "webp",
      fileName: "ipad-landscape.webp",
      alt: "iPad landscape screenshot",
      width: 1640,
      height: 2360,
    };

    const { container } = render(
      <div style={{ width: "872px" }}>
        <ImageCard source={source} isBlock />
      </div>,
    );

    const card = container.querySelector<HTMLElement>("[data-poracode-image-card]")!;
    const img = container.querySelector<HTMLImageElement>("img")!;

    await waitFor(() => {
      const rect = img.getBoundingClientRect();
      expect(rect.width).toBeGreaterThan(400);
      expect(Math.abs(rect.width / rect.height - 960 / 667)).toBeLessThan(0.02);
    });

    const cardRect = card.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    expect(Math.abs(cardRect.width - imgRect.width)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(cardRect.height - imgRect.height)).toBeLessThanOrEqual(2.5);
  });

  it("keeps pending and loaded card sizes identical inside a narrow mobile column", async () => {
    const blobUrl = await makeCanvasBlobUrl(960, 384);
    const baseSource: ImageViewSource = {
      src: "",
      mime: "image/png",
      extension: "png",
      fileName: "wide.png",
      alt: "Wide screenshot",
      width: 2000,
      height: 800,
      pending: true,
    };

    const view = render(
      <div style={{ width: "350px" }}>
        <ImageCard source={baseSource} isBlock />
      </div>,
    );

    const card = view.container.querySelector<HTMLElement>("[data-poracode-image-card]")!;
    const pendingRect = card.getBoundingClientRect();
    expect(Math.abs(pendingRect.width - 350)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendingRect.height - 140)).toBeLessThanOrEqual(3);

    view.rerender(
      <div style={{ width: "350px" }}>
        <ImageCard source={{ ...baseSource, src: blobUrl, pending: false }} isBlock />
      </div>,
    );

    await waitFor(() => {
      const img = view.container.querySelector<HTMLImageElement>("img");
      expect(img?.naturalWidth).toBe(960);
    });

    const loadedRect = card.getBoundingClientRect();
    expect(Math.abs(loadedRect.width - pendingRect.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadedRect.height - pendingRect.height)).toBeLessThanOrEqual(1);
  });
});
