import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ImageFileView } from "./ImageFileView";
import { SvgFileView } from "./SvgFileView";
import { NativeMediaView } from "./NativeMediaView";
import { openImageLightbox } from "@/renderer/components/composer/ImageLightbox";

vi.mock("@/renderer/components/composer/ImageLightbox", () => ({
  openImageLightbox: vi.fn<typeof openImageLightbox>(),
}));
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("editor media views", () => {
  it("shows image dimensions/size, opens the shared zoom lightbox, and recovers after a failed source changes", () => {
    const props = {
      src: "http://host/preview-one",
      fileName: "image.png",
      sizeBytes: 2048,
      fallback: <div>fallback</div>,
    };
    const screen = render(<ImageFileView {...props} />);
    const image = screen.getByRole("img");
    Object.defineProperties(image, { naturalWidth: { value: 128 }, naturalHeight: { value: 96 } });
    fireEvent.load(image);
    expect(screen.getByTestId("media-details")).toHaveTextContent("128 × 96");
    fireEvent.click(screen.getByRole("button", { name: "Open image preview" }));
    expect(openImageLightbox).toHaveBeenCalledWith(
      [{ src: props.src, alt: "image.png", fileName: "image.png" }],
      0,
    );
    fireEvent.error(image);
    expect(screen.getByText("fallback")).toBeInTheDocument();
    screen.rerender(<ImageFileView {...props} src="http://host/preview-two" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "http://host/preview-two");
  });

  it("keeps SVG content in an inert image resource, including unsaved content and invalid fallback", () => {
    const content =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>window.probe=true</script><rect width="8"/></svg>';
    const screen = render(<SvgFileView path="icon.svg" content={content} />);
    expect(screen.container.querySelector("script")).toBeNull();
    expect(screen.container.querySelector("svg")).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`,
    );
    screen.rerender(<SvgFileView path="icon.svg" content="<invalid" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("This SVG can't be displayed.")).toBeInTheDocument();
  });

  it("keeps image metadata, native buffer/seek/pause state and decode fallback unchanged when the stable URL renews", () => {
    const props = {
      kind: "video" as const,
      src: "http://host/stable",
      sizeBytes: 10,
      fallback: <div>fallback</div>,
    };
    const screen = render(<NativeMediaView {...props} />);
    const player = screen.container.querySelector("video")!;
    player.currentTime = 92;
    Object.defineProperties(player, {
      duration: { value: 220 },
      videoWidth: { value: 640 },
      videoHeight: { value: 360 },
      paused: { value: false },
    });
    fireEvent.loadedMetadata(player);
    const details = screen.getByTestId("media-details").textContent;
    screen.rerender(<NativeMediaView {...props} />);
    expect(screen.container.querySelector("video")).toBe(player);
    expect(player.load).toHaveBeenCalledOnce();
    expect(player.currentTime).toBe(92);
    expect(player.paused).toBe(false);
    expect(screen.getByTestId("media-details").textContent).toBe(details);
    fireEvent.error(player);
    screen.rerender(<NativeMediaView {...props} />);
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(screen.container.querySelector("video")).toBeNull();
    expect(player.load).toHaveBeenCalledOnce();
    screen.unmount();

    const imageScreen = render(
      <ImageFileView
        src={props.src}
        fileName="portrait.png"
        sizeBytes={10}
        fallback={<div>fallback</div>}
      />,
    );
    const image = imageScreen.getByRole("img");
    Object.defineProperties(image, { naturalWidth: { value: 100 }, naturalHeight: { value: 200 } });
    fireEvent.load(image);
    imageScreen.rerender(
      <ImageFileView
        src={props.src}
        fileName="portrait.png"
        sizeBytes={10}
        fallback={<div>fallback</div>}
      />,
    );
    expect(imageScreen.getByRole("img")).toBe(image);
    expect(imageScreen.getByTestId("media-details")).toHaveTextContent("100 × 200");
  });

  it("uses native controls without autoplay and preserves seek position/play intent across a real source reload", () => {
    const props = {
      kind: "video" as const,
      src: "http://host/first",
      sizeBytes: 2048,
      fallback: <div>fallback</div>,
    };
    const screen = render(<NativeMediaView {...props} />);
    const player = screen.container.querySelector("video")!;
    expect(player).toHaveAttribute("controls");
    expect(player).toHaveAttribute("playsinline");
    expect(player).not.toHaveAttribute("autoplay");
    Object.defineProperties(player, {
      duration: { value: 125 },
      videoWidth: { value: 320 },
      videoHeight: { value: 180 },
    });
    fireEvent.loadedMetadata(player);
    expect(screen.getByTestId("media-details")).toHaveTextContent("320 × 180");
    expect(screen.getByTestId("media-details")).toHaveTextContent("2:05");
    player.currentTime = 42;
    Object.defineProperty(player, "paused", { configurable: true, value: false });
    fireEvent.play(player);
    screen.rerender(<NativeMediaView {...props} src="http://host/renewed" />);
    player.currentTime = 0;
    fireEvent.timeUpdate(player);
    fireEvent.pause(player);
    fireEvent.loadedMetadata(player);
    expect(player.currentTime).toBe(42);
    expect(player.play).toHaveBeenCalledOnce();
    fireEvent.error(player);
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });

  it("retires the recovered player after a decode failure and subsequent source reload", () => {
    const props = {
      kind: "video" as const,
      src: "http://host/broken",
      sizeBytes: 100,
      fallback: <div>fallback</div>,
    };
    const screen = render(<NativeMediaView {...props} />);
    const initial = screen.container.querySelector("video")!;
    fireEvent.error(initial);
    expect(screen.getByText("fallback")).toBeInTheDocument();
    vi.mocked(initial.pause).mockClear();
    screen.rerender(<NativeMediaView {...props} src="http://host/recovered" />);
    const recovered = screen.container.querySelector("video")!;
    expect(recovered).not.toBe(initial);
    screen.unmount();
    expect(recovered.pause).toHaveBeenCalledOnce();
  });

  it("shows native audio controls and releases playback when the pane unmounts", () => {
    const screen = render(
      <NativeMediaView
        kind="audio"
        src="http://host/audio"
        sizeBytes={40}
        fallback={<div>fallback</div>}
      />,
    );
    const player = screen.container.querySelector("audio")!;
    expect(player).toHaveAttribute("controls");
    screen.unmount();
    expect(player.pause).toHaveBeenCalledOnce();
  });
});
