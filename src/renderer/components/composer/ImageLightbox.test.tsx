import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  ImageLightboxHost,
  ImageLightboxView,
  openAttachmentLightbox,
  openImageLightbox,
  closeImageLightboxForSource,
  closeImageLightbox,
  updateImageLightboxFromPreview,
  updateImageLightboxFromThread,
} from "./ImageLightbox";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
const copyImageToClipboard = vi
  .fn<(payload: { data: Uint8Array }) => Promise<boolean>>()
  .mockResolvedValue(true);
const saveImageFile = vi
  .fn<(payload: { data: Uint8Array; suggestedName: string }) => Promise<string | null>>()
  .mockResolvedValue(null);
const readLocalImageFile = vi
  .fn<(payload: { url: string }) => Promise<Uint8Array>>()
  .mockResolvedValue(png);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ copyImageToClipboard, saveImageFile, readLocalImageFile }),
}));

vi.mock("../thread/useThreadGalleryImages", () => ({
  useThreadGalleryImages: vi.fn<() => void>(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  copyImageToClipboard.mockResolvedValue(true);
});

function openPreview() {
  const onClose = vi.fn<() => void>();
  render(
    <ImageLightboxView
      images={[
        { src: "poracode-local:///C:/images/sample.png", alt: "sample.png" },
        { src: "data:image/png;base64,iVBORw==", alt: "Generated landscape" },
      ]}
      initialIndex={0}
      onClose={onClose}
    />,
  );
  return onClose;
}

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "";
  }
}

const gestureStageRect = {
  left: 0,
  top: 0,
  right: 400,
  bottom: 300,
  width: 400,
  height: 300,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

function renderGestureImage(
  images: Parameters<typeof ImageLightboxView>[0]["images"] = [
    { src: "data:image/png;base64,AAA", alt: "Gesture image" },
  ],
) {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const onClose = vi.fn<() => void>();
  render(<ImageLightboxView images={images} initialIndex={0} onClose={onClose} />);
  const stage = document.querySelector(".poracode-image-lightbox__stage") as HTMLDivElement;
  const image = document.querySelector(".poracode-image-lightbox__image") as HTMLImageElement;
  Object.defineProperties(stage, {
    clientWidth: { value: 400, configurable: true },
    clientHeight: { value: 300, configurable: true },
    getBoundingClientRect: { value: () => gestureStageRect, configurable: true },
  });
  const captured = { stage: new Set<number>(), image: new Set<number>() };
  const defineCapture = (target: HTMLElement, ids: Set<number>) => {
    Object.defineProperties(target, {
      setPointerCapture: {
        value: (pointerId: number) => ids.add(pointerId),
        configurable: true,
      },
      hasPointerCapture: {
        value: (pointerId: number) => ids.has(pointerId),
        configurable: true,
      },
      releasePointerCapture: {
        value: (pointerId: number) => ids.delete(pointerId),
        configurable: true,
      },
    });
  };
  defineCapture(stage, captured.stage);
  defineCapture(image, captured.image);
  Object.defineProperties(image, {
    clientWidth: { value: 400, configurable: true },
    clientHeight: { value: 300, configurable: true },
  });
  return { stage, image, onClose, captured };
}

function dispatchWheel(stage: HTMLDivElement, init: WheelEventInit) {
  let event!: WheelEvent;
  act(() => {
    event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    stage.dispatchEvent(event);
  });
  return event;
}

function dispatchGesture(stage: HTMLDivElement, type: string, scale: number) {
  let event!: Event;
  act(() => {
    event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      scale: { value: scale },
      clientX: { value: 200 },
      clientY: { value: 150 },
    });
    stage.dispatchEvent(event);
  });
  return event;
}

describe("lightbox gestural zoom", () => {
  it("toggles double-click fit to 2x at the click anchor and back to fit", () => {
    const { image } = renderGestureImage();

    fireEvent.doubleClick(image, { clientX: 100, clientY: 75 });
    expect(screen.getByText("200%")).toBeInTheDocument();
    expect(image.style.transform).toBe("translate3d(100px, 75px, 0) scale(2)");

    fireEvent.doubleClick(image, { clientX: 100, clientY: 75 });
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(image.style.transform).toBe("translate3d(0px, 0px, 0) scale(1)");
  });

  it("zooms only ctrl+wheel, anchors at the pointer, and leaves plain wheel alone", () => {
    const { stage, image } = renderGestureImage();

    const plain = dispatchWheel(stage, { deltaY: -100, clientX: 200, clientY: 150 });
    expect(plain.defaultPrevented).toBe(false);
    expect(screen.getByText("100%")).toBeInTheDocument();

    const zoom = dispatchWheel(stage, {
      deltaY: -100,
      clientX: 100,
      clientY: 75,
      ctrlKey: true,
    });
    expect(zoom.defaultPrevented).toBe(true);
    expect(screen.getByText("122%")).toBeInTheDocument();
    const pan = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(image.style.transform);
    expect(pan).not.toBeNull();
    expect(Number(pan![1])).toBeCloseTo(22.14, 1);
    expect(Number(pan![2])).toBeCloseTo(16.61, 1);

    const out = dispatchWheel(stage, {
      deltaY: 100,
      clientX: 100,
      clientY: 75,
      ctrlKey: true,
    });
    expect(out.defaultPrevented).toBe(true);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it.each([
    { name: "pixel", deltaY: -16, deltaMode: 0, expected: "103%" },
    { name: "line", deltaY: -1, deltaMode: 1, expected: "103%" },
    { name: "page", deltaY: -1, deltaMode: 2, expected: "182%" },
  ])("normalizes $name wheel deltas", ({ deltaY, deltaMode, expected }) => {
    const { stage } = renderGestureImage();
    dispatchWheel(stage, { deltaY, deltaMode, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("accumulates batched wheel increments and clamps the scale", () => {
    const { stage } = renderGestureImage();
    act(() => {
      for (let index = 0; index < 2; index += 1) {
        stage.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -100,
            ctrlKey: true,
            clientX: 200,
            clientY: 150,
          }),
        );
      }
    });
    expect(screen.getByText("149%")).toBeInTheDocument();

    dispatchWheel(stage, { deltaY: -10_000, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(screen.getByText("400%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

    dispatchWheel(stage, { deltaY: 10_000, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("pinches out and in with two distinct touch pointers", () => {
    const { image } = renderGestureImage();
    fireEvent.pointerDown(image, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(image, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    act(() => {
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
      });
    });
    expect(screen.getByText("200%")).toBeInTheDocument();
    expect(image.style.transform).toBe("translate3d(0px, 0px, 0) scale(2)");

    act(() => {
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 150,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 250,
        clientY: 150,
      });
    });
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(image.style.transform).toBe("translate3d(0px, 0px, 0) scale(1)");
  });

  it("translates a pinch midpoint and continues with the remaining pointer", () => {
    const { image } = renderGestureImage();
    fireEvent.pointerDown(image, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(image, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    act(() => {
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 120,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 320,
        clientY: 150,
      });
    });
    expect(screen.getByText("200%")).toBeInTheDocument();
    expect(image.style.transform).toBe("translate3d(20px, 0px, 0) scale(2)");

    fireEvent.pointerUp(image, { pointerId: 2, pointerType: "touch" });
    fireEvent.pointerMove(image, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 150,
      clientY: 160,
    });
    expect(image.style.transform).toBe("translate3d(50px, 10px, 0) scale(2)");
  });

  it("cancels pointers and ignores their later moves", () => {
    const { image } = renderGestureImage();
    fireEvent.pointerDown(image, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(image, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    act(() => {
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
      });
    });
    const before = image.style.transform;
    fireEvent.pointerCancel(image, { pointerId: 1, pointerType: "touch" });
    fireEvent.lostPointerCapture(image, { pointerId: 2, pointerType: "touch" });
    fireEvent.pointerMove(image, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 50,
      clientY: 50,
    });
    expect(image.style.transform).toBe(before);
  });

  it("suppresses dismissal after a gesture but lets a fresh backdrop click close", () => {
    const { stage, image, onClose } = renderGestureImage();
    fireEvent.pointerDown(image, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(image, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    act(() => {
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
      });
    });

    fireEvent.click(stage);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerUp(image, { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(image, { pointerId: 2, pointerType: "touch" });
    fireEvent.pointerDown(stage, {
      pointerId: 9,
      pointerType: "mouse",
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 9,
      pointerType: "mouse",
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(stage);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses native WebKit gesture scale and ignores ctrl+wheel while it is active", () => {
    const { stage } = renderGestureImage();
    expect(dispatchGesture(stage, "gesturestart", 1).defaultPrevented).toBe(true);
    dispatchGesture(stage, "gesturechange", 1.5);
    expect(screen.getByText("150%")).toBeInTheDocument();
    dispatchGesture(stage, "gesturechange", 2);
    expect(screen.getByText("200%")).toBeInTheDocument();

    const wheel = dispatchWheel(stage, {
      deltaY: -100,
      ctrlKey: true,
      clientX: 200,
      clientY: 150,
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByText("200%")).toBeInTheDocument();
    dispatchGesture(stage, "gestureend", 2);
  });

  it("does not apply native gesture scale while two touch pointers own the pinch", () => {
    const { stage, image } = renderGestureImage();
    fireEvent.pointerDown(image, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(image, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    dispatchGesture(stage, "gesturestart", 1);
    dispatchGesture(stage, "gesturechange", 2);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("resets on image navigation and ignores a stale pointer move", () => {
    const { stage, image } = renderGestureImage([
      { src: "data:image/png;base64,AAA", alt: "First" },
      { src: "data:image/png;base64,BBB", alt: "Second" },
    ]);
    dispatchWheel(stage, { deltaY: -100, ctrlKey: true, clientX: 200, clientY: 150 });
    fireEvent.pointerDown(image, {
      pointerId: 7,
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(image, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 150,
      clientY: 100,
    });
    dispatchGesture(stage, "gesturestart", 1);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    dispatchGesture(stage, "gesturechange", 2);
    dispatchGesture(stage, "gesturechange", 3);
    expect(screen.getByText("100%")).toBeInTheDocument();
    const before = image.style.transform;
    fireEvent.pointerMove(image, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 300,
      clientY: 300,
    });
    expect(image.style.transform).toBe(before);

    dispatchGesture(stage, "gesturestart", 1);
    dispatchGesture(stage, "gesturechange", 2);
    expect(screen.getByText("200%")).toBeInTheDocument();
  });

  it("resets captured pointers and native gestures for identical-src gallery entries", () => {
    const { stage, image, captured } = renderGestureImage([
      { src: "data:image/png;base64,AAA", alt: "First" },
      { src: "data:image/png;base64,AAA", alt: "Second" },
    ]);
    fireEvent.pointerDown(image, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(image, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    act(() => {
      fireEvent.pointerMove(image, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
      });
      fireEvent.pointerMove(image, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
      });
    });
    expect(screen.getByText("200%")).toBeInTheDocument();
    dispatchGesture(stage, "gesturestart", 1);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByAltText("Second")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(captured.image.size).toBe(0);
    const before = image.style.transform;
    fireEvent.pointerMove(image, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 300,
    });
    expect(image.style.transform).toBe(before);

    dispatchGesture(stage, "gesturechange", 2);
    dispatchGesture(stage, "gesturechange", 3);
    expect(screen.getByText("100%")).toBeInTheDocument();
    dispatchGesture(stage, "gesturestart", 1);
    dispatchGesture(stage, "gesturechange", 2);
    expect(screen.getByText("200%")).toBeInTheDocument();
  });

  it("captures a stage-origin touch on the stage and still dismisses a normal backdrop tap", () => {
    const { stage, onClose, captured } = renderGestureImage();
    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 50,
      clientY: 50,
    });
    expect(captured.stage.has(1)).toBe(true);
    expect(captured.image.size).toBe(0);
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch" });
    expect(captured.stage.has(1)).toBe(false);
    fireEvent.click(stage);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not suppress a small stage tap", () => {
    const { stage, onClose } = renderGestureImage();
    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 52,
      clientY: 51,
    });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch" });
    fireEvent.click(stage);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pinches when the first touch starts on the stage", () => {
    const { stage, captured } = renderGestureImage();
    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(stage, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    expect(captured.stage.size).toBe(2);
    expect(captured.image.size).toBe(0);
    act(() => {
      fireEvent.pointerMove(stage, {
        pointerId: 1,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
      });
      fireEvent.pointerMove(stage, {
        pointerId: 2,
        pointerType: "touch",
        clientX: 300,
        clientY: 150,
      });
    });
    expect(screen.getByText("200%")).toBeInTheDocument();
  });

  it("suppresses dismissal when a second pointer joins without motion", () => {
    const { stage, onClose } = renderGestureImage();
    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(stage, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(stage, { pointerId: 2, pointerType: "touch" });
    fireEvent.click(stage);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("suppresses dismissal after a real stage drag", () => {
    const { stage, onClose } = renderGestureImage();
    fireEvent.pointerDown(stage, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 80,
      clientY: 50,
    });
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch" });
    fireEvent.click(stage);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("image preview toolbar", () => {
  it("keeps a pasted attachment's original filename and format behind its blob URL", async () => {
    const webp = new Uint8Array([82, 73, 70, 70]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>>()
        .mockResolvedValue({ ok: true, arrayBuffer: async () => webp.buffer }),
    );
    render(<ImageLightboxHost />);
    act(() =>
      openAttachmentLightbox(
        [
          {
            id: "pasted",
            path: "C:/attachments/Pasted image.webp",
            name: "Pasted image.webp",
            previewUrl: "blob:opaque-id",
            mimeType: "image/webp",
            isImage: true,
          },
        ],
        0,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(saveImageFile).toHaveBeenCalledWith({
        data: webp,
        suggestedName: "Pasted image.webp",
      }),
    );
  });
  it("copies a local attachment without closing or changing the zoomed preview", async () => {
    const onClose = openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledWith({ data: png }));
    expect(readLocalImageFile).toHaveBeenCalledWith({
      url: "poracode-local:///C:/images/sample.png",
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".poracode-image-lightbox__image")).toHaveStyle({
      transform: "translate3d(0px, 0px, 0) scale(1.5)",
    });
  });

  it("saves the currently displayed generated image with the original bytes", async () => {
    const fetchMock = vi
      .fn<(src: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>>()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => png.buffer });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(saveImageFile).toHaveBeenCalledWith({
        data: png,
        suggestedName: "generated-landscape.png",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,iVBORw==");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps gallery keyboard navigation and Escape available from the toolbar", () => {
    const onClose = openPreview();
    const copy = screen.getByRole("button", { name: "Copy image" });
    expect(copy.closest(".poracode-image-lightbox__footer")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Save image" })
        .closest(".poracode-image-lightbox__footer"),
    ).not.toBeNull();
    fireEvent.keyDown(copy, { key: "ArrowRight" });
    expect(document.querySelector(".poracode-image-lightbox__image")).toHaveAttribute(
      "alt",
      "Generated landscape",
    );
    fireEvent.keyDown(copy, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("reports clipboard rejection and read errors", async () => {
    const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    copyImageToClipboard.mockResolvedValue(false);
    openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await waitFor(() => expect(danger).toHaveBeenCalledWith("Unable to copy image."));
    readLocalImageFile.mockRejectedValueOnce(new Error("missing file"));

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(danger).toHaveBeenCalledWith("Unable to save image."));
  });
});

it("keeps stable editor lightbox zoom and pinned actions until the exact owning source retires", async () => {
  const readBytes = vi.fn<() => Promise<Uint8Array<ArrayBuffer>>>().mockResolvedValue(png);
  render(<ImageLightboxHost />);
  act(() =>
    openImageLightbox(
      [{ src: "https://media.test/stable", alt: "image.png", fileName: "image.png", readBytes }],
      0,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  const before = screen.getByRole("img").style.transform;
  act(() => closeImageLightboxForSource("https://media.test/unrelated"));
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://media.test/stable");
  expect(screen.getByRole("img").style.transform).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Save image" }));
  await waitFor(() => expect(readBytes).toHaveBeenCalledOnce());
  act(() => closeImageLightboxForSource("https://media.test/stable"));
  expect(screen.queryByRole("img")).toBeNull();
  act(() => closeImageLightbox());
});

describe("progressive image preview", () => {
  function deferredDecode() {
    const decoded = Promise.withResolvers<void>();
    const decode = vi.fn<() => Promise<void>>(() => decoded.promise);
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = decode;
      },
    );
    return decoded;
  }

  it("retains the thumbnail through gallery updates until the original decodes, preserving zoom", async () => {
    const decoded = deferredDecode();
    render(<ImageLightboxHost />);
    act(() =>
      openImageLightbox(
        [
          {
            src: "blob:thumbnail",
            previewSrc: "blob:thumbnail",
            alt: "shot.png",
            width: 800,
            height: 600,
          },
        ],
        0,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const before = screen.getByRole("img").getAttribute("style");
    act(() =>
      updateImageLightboxFromPreview("blob:thumbnail", [
        { src: "blob:other", alt: "other.png" },
        {
          src: "blob:original",
          previewSrc: "blob:thumbnail",
          alt: "shot.png",
          width: 800,
          height: 600,
        },
      ]),
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:thumbnail");
    expect(screen.getByRole("img").getAttribute("style")).toBe(before);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    await act(async () => decoded.resolve());
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:original");
    expect(screen.getByRole("img").getAttribute("style")).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:other");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("keeps the thumbnail when original decoding fails", async () => {
    const decoded = deferredDecode();
    render(
      <ImageLightboxView
        images={[{ src: "blob:original", previewSrc: "blob:thumbnail", alt: "shot.png" }]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    await act(async () => decoded.reject(new Error("invalid image")));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:thumbnail");
  });

  it("preserves the current thumbnail when the live thread refreshes before decoding", () => {
    deferredDecode();
    render(<ImageLightboxHost />);
    act(() =>
      openImageLightbox(
        [{ src: "blob:original", previewSrc: "blob:thumbnail", alt: "shot.png" }],
        0,
        { liveThreadId: "thread" },
      ),
    );
    act(() => updateImageLightboxFromThread("thread", [{ src: "blob:original", alt: "shot.png" }]));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:thumbnail");
  });

  it.each([true, false])(
    "retires revoked resource URLs while preserving zoom (original decoded: %s)",
    async (decodedBeforeRetirement) => {
      const oldDecode = Promise.withResolvers<void>();
      const decode = vi.fn<() => Promise<void>>(() => oldDecode.promise);
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          decode = decode;
        },
      );
      let snapshot = "blob:old-original";
      const resource = {
        key: "stable-coordinate",
        subscribe: vi.fn<(listener: () => void) => () => void>(() => () => {}),
        getSnapshot: () => snapshot,
        request: vi.fn<() => void>(),
      };
      render(<ImageLightboxHost />);
      act(() =>
        openImageLightbox(
          [
            {
              src: snapshot,
              previewSrc: "blob:thumbnail",
              resource,
              alt: "shot.png",
              width: 800,
              height: 600,
            },
          ],
          0,
          { liveThreadId: "thread" },
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      const before = screen.getByRole("img").style.transform;
      if (decodedBeforeRetirement) {
        await act(async () => oldDecode.resolve());
      }
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        decodedBeforeRetirement ? "blob:old-original" : "blob:thumbnail",
      );
      act(() => {
        snapshot = "";
        updateImageLightboxFromThread("thread", [{ src: snapshot, resource, alt: "shot.png" }]);
      });
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Loading…");
      expect(screen.queryByRole("button", { name: "Copy image" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Save image" })).toBeNull();
      expect(screen.getByText("150%")).toBeInTheDocument();
      expect(resource.request).toHaveBeenCalled();
      if (!decodedBeforeRetirement) {
        await act(async () => oldDecode.resolve());
      }
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Loading…");
      act(() => {
        snapshot = "blob:new-original";
        updateImageLightboxFromThread("thread", [{ src: snapshot, resource, alt: "shot.png" }]);
      });
      expect(screen.getByRole("img")).toHaveAttribute("src", "blob:new-original");
      expect(screen.getByRole("img").style.transform).toBe(before);
      expect(screen.getByText("150%")).toBeInTheDocument();
      expect(decode).toHaveBeenCalledOnce();
    },
  );

  it("retires the old thumbnail on resource notifications before any gallery refresh", async () => {
    const decoded = deferredDecode();
    let snapshot = "blob:old-original";
    const listeners = new Set<() => void>();
    const resource = {
      key: "stable-coordinate",
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => snapshot,
      request: vi.fn<() => void>(),
    };
    render(
      <ImageLightboxView
        images={[
          {
            src: "blob:old-original",
            previewSrc: "blob:thumbnail",
            resource,
            alt: "shot.png",
          },
        ]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    expect(listeners.size).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const before = screen.getByRole("img").style.transform;
    await act(async () => decoded.resolve());
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:old-original");
    act(() => {
      snapshot = "";
      for (const listener of listeners) listener();
    });
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(resource.request).toHaveBeenCalled();
    act(() => {
      snapshot = "blob:new-original";
      for (const listener of listeners) listener();
    });
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:new-original");
    expect(screen.getByRole("img").style.transform).toBe(before);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("re-requests a still-empty resource when it notifies, such as a lapsed retry window", () => {
    const listeners = new Set<() => void>();
    const resource = {
      key: "failed-coordinate",
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => "",
      request: vi.fn<() => void>(),
    };
    render(
      <ImageLightboxView
        images={[{ src: "", resource, alt: "shot.png" }]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    const requestsBefore = resource.request.mock.calls.length;
    expect(requestsBefore).toBeGreaterThan(0);
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(resource.request.mock.calls.length).toBeGreaterThan(requestsBefore);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("keeps previews isolated for distinct resource keys sharing a blob URL", () => {
    deferredDecode();
    const resourceA = {
      key: "coordinate-a",
      subscribe: vi.fn<(listener: () => void) => () => void>(() => () => {}),
      getSnapshot: () => "blob:shared-original",
      request: vi.fn<() => void>(),
    };
    const resourceB = { ...resourceA, key: "coordinate-b" };
    render(<ImageLightboxHost />);
    act(() =>
      openImageLightbox(
        [
          {
            src: "blob:shared-original",
            resource: resourceA,
            previewSrc: "blob:thumbnail-a",
            alt: "A",
          },
          {
            src: "blob:shared-original",
            resource: resourceB,
            previewSrc: "blob:thumbnail-b",
            alt: "B",
          },
        ],
        1,
        { liveThreadId: "thread" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    act(() =>
      updateImageLightboxFromThread("thread", [
        { src: "blob:shared-original", resource: resourceB, alt: "B" },
        { src: "blob:shared-original", resource: resourceA, alt: "A" },
      ]),
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:thumbnail-b");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "B");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("150%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:thumbnail-a");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "A");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("ignores a previous image's decode after navigation", async () => {
    const decoded = deferredDecode();
    render(
      <ImageLightboxView
        images={[
          { src: "blob:original", previewSrc: "blob:thumbnail", alt: "shot.png" },
          { src: "blob:other", alt: "other.png" },
        ]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => decoded.resolve());
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:other");
  });

  it("keeps an original save pending while the thumbnail upgrades", async () => {
    deferredDecode();
    const bytes = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const readBytes = vi.fn<() => Promise<Uint8Array<ArrayBuffer>>>(() => bytes.promise);
    const view = render(
      <ImageLightboxView
        images={[{ src: "blob:thumbnail", previewSrc: "blob:thumbnail", readBytes }]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    expect(screen.getByRole("button", { name: "Save image" })).toBeDisabled();
    view.rerender(
      <ImageLightboxView
        images={[{ src: "blob:original", previewSrc: "blob:thumbnail" }]}
        initialIndex={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Save image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy image" })).toBeDisabled();
    await act(async () => bytes.resolve(png));
    expect(screen.getByRole("button", { name: "Save image" })).not.toBeDisabled();
    expect(readBytes).toHaveBeenCalledOnce();
  });

  it("continues an active pan when the upgraded image relocates within the gallery", () => {
    deferredDecode();
    vi.stubGlobal("PointerEvent", MouseEvent);
    render(<ImageLightboxHost />);
    act(() => openImageLightbox([{ src: "blob:thumbnail", alt: "shot.png" }], 0));
    const image = screen.getByRole("img");
    Object.defineProperties(image, {
      setPointerCapture: { value: vi.fn<(id: number) => void>() },
      hasPointerCapture: { value: vi.fn<(id: number) => boolean>(() => true) },
      releasePointerCapture: { value: vi.fn<(id: number) => void>() },
    });
    Object.defineProperty(image, "clientWidth", { value: 400 });
    Object.defineProperty(image, "clientHeight", { value: 300 });
    Object.defineProperty(image.parentElement, "clientWidth", { value: 400 });
    Object.defineProperty(image.parentElement, "clientHeight", { value: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.pointerDown(image, { button: 0, clientX: 0, clientY: 0 });
    act(() =>
      updateImageLightboxFromPreview("blob:thumbnail", [
        { src: "blob:other", alt: "other.png" },
        { src: "blob:original", previewSrc: "blob:thumbnail", alt: "shot.png" },
      ]),
    );
    fireEvent.pointerMove(image, { clientX: 50, clientY: 25 });
    expect(image.style.transform).toBe("translate3d(50px, 25px, 0) scale(1.5)");
  });
});
