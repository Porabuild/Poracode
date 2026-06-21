import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageLightboxHost } from "@/renderer/components/composer";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ImageView } from "./ImageView";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function imageItem(payload: Record<string, unknown>): RuntimeChatItem {
  return {
    id: "image_1",
    type: "image_view",
    state: "completed",
    payload,
    streams: {},
  };
}

describe("ImageView", () => {
  it("renders an inline <img> with an overlaid action toolbar (no visible caption)", () => {
    render(
      <AppProvider>
        <ImageView
          item={imageItem({
            name: "imageGeneration",
            status: "success",
            result: PNG_BASE64,
            args: { prompt: "A red square" },
          })}
        />
      </AppProvider>,
    );

    const img = screen.getByAltText("A red square") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(img.getAttribute("width")).toBe("1");
    expect(img.getAttribute("height")).toBe("1");
    expect(img.getAttribute("loading")).toBeNull();
    // The prompt lives only on the <img> alt for a11y — it is not written as a
    // visible caption (the picture may be shared, not "generated").
    expect(screen.queryByText("A red square")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open preview" })).toBeTruthy();
  });

  it("opens a lightbox when the image is clicked", () => {
    render(
      <AppProvider>
        <ImageView item={imageItem({ name: "imageGeneration", result: PNG_BASE64 })} />
        <ImageLightboxHost />
      </AppProvider>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open image preview" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("falls back to the tool-call row when the result is not an image", () => {
    render(
      <AppProvider>
        <ImageView
          item={imageItem({
            name: "imageGeneration",
            status: "success",
            result: "Sorry, image generation failed.",
          })}
        />
      </AppProvider>,
    );

    // No inline image card; the generic tool-call accordion is shown instead.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/imageGeneration/i)).toBeTruthy();
  });
});
