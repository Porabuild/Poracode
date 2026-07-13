import {
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { Attachment } from "./useAttachments";

/** A pre-resolved image for the lightbox: a renderable URL plus an accessible label. */
export interface LightboxImage {
  /** Renderable image URL — a `data:`, `poracode-local://`, or remote URL. */
  src: string;
  /** Accessible label / alt text. */
  alt?: string;
}

type LightboxState = {
  images: readonly LightboxImage[];
  initialIndex: number;
  nonce: number;
};

type Point = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

let lightboxState: LightboxState | null = null;
let lightboxNonce = 0;
const lightboxListeners = new Set<() => void>();

function emitLightboxChange() {
  for (const listener of lightboxListeners) listener();
}

function subscribeLightbox(listener: () => void): () => void {
  lightboxListeners.add(listener);
  return () => {
    lightboxListeners.delete(listener);
  };
}

function getLightboxSnapshot(): LightboxState | null {
  return lightboxState;
}

export function openImageLightbox(images: readonly LightboxImage[], initialIndex: number): void {
  if (images.length === 0) return;
  lightboxState = {
    images: [...images],
    initialIndex: Math.min(Math.max(0, initialIndex), images.length - 1),
    nonce: ++lightboxNonce,
  };
  emitLightboxChange();
}

export function openAttachmentLightbox(
  attachments: readonly Attachment[],
  initialIndex: number,
): void {
  openImageLightbox(
    attachments.map((img) => ({
      src: toLocalFileUrl(img.path),
      alt: img.name,
    })),
    initialIndex,
  );
}

export function closeImageLightbox(): void {
  if (lightboxState === null) return;
  lightboxState = null;
  emitLightboxChange();
}

export const ImageLightboxHost = memo(function ImageLightboxHost() {
  const state = useSyncExternalStore(subscribeLightbox, getLightboxSnapshot, getLightboxSnapshot);
  useEffect(() => closeImageLightbox, []);
  if (!state) return null;
  return (
    <ImageLightboxView
      key={state.nonce}
      images={state.images}
      initialIndex={state.initialIndex}
      onClose={closeImageLightbox}
    />
  );
});

/**
 * Source-agnostic fullscreen image viewer. Accepts already-resolved image URLs
 * (`data:`, `poracode-local://`, remote) so it can be reused for chat-generated
 * images as well as composer attachments. Supports keyboard nav and prev/next
 * chrome for multi-image galleries; a single image renders without that chrome.
 */
export function ImageLightboxView(props: {
  images: readonly LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { images, initialIndex, onClose } = props;
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    pointerStart: Point;
    panStart: Point;
  } | null>(null);
  const current = images[index];

  // Reset index if initialIndex changes (new lightbox open)
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setScale(MIN_SCALE);
    setPan({ x: 0, y: 0 });
    dragRef.current = null;
  }, [index]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, images.length]);

  useEffect(() => {
    function handleResize() {
      setPan((currentPan) => clampPan(currentPan, scale, stageRef.current, imageRef.current));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scale]);

  if (!current) return null;

  function zoomBy(delta: number) {
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
    setScale(nextScale);
    setPan((currentPan) => clampPan(currentPan, nextScale, stageRef.current, imageRef.current));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (scale <= MIN_SCALE || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      pointerStart: { x: event.clientX, y: event.clientY },
      panStart: pan,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan(
      clampPan(
        {
          x: drag.panStart.x + event.clientX - drag.pointerStart.x,
          y: drag.panStart.y + event.clientY - drag.pointerStart.y,
        },
        scale,
        stageRef.current,
        imageRef.current,
      ),
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  return createPortal(
    <div // eslint-disable-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss is mouse-only by design; Escape (handled via the useEffect above) is the keyboard equivalent
      className="poracode-image-lightbox"
      onClick={(event) => {
        const target = event.target;
        if (
          target === event.currentTarget ||
          (target instanceof HTMLElement &&
            target.classList.contains("poracode-image-lightbox__stage"))
        ) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={current.alt ?? t`Image preview`}
    >
      <button
        type="button"
        className="poracode-image-lightbox__close"
        aria-label={t`Close preview`}
        onClick={onClose}
      >
        <X className="size-5" />
      </button>

      {images.length > 1 ? (
        <button
          type="button"
          className="poracode-image-lightbox__nav poracode-image-lightbox__nav--prev"
          aria-label={t`Previous image`}
          onClick={(e) => {
            e.stopPropagation();
            setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
          }}
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}

      <div ref={stageRef} className="poracode-image-lightbox__stage">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the image supports pointer-drag panning; keyboard image navigation remains on the dialog */}
        <img
          ref={imageRef}
          className={`poracode-image-lightbox__image${scale > MIN_SCALE ? " poracode-image-lightbox__image--zoomed" : ""}`}
          src={current.src}
          alt={current.alt ?? ""}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          decoding="async"
          draggable={false}
        />
      </div>

      {images.length > 1 ? (
        <button
          type="button"
          className="poracode-image-lightbox__nav poracode-image-lightbox__nav--next"
          aria-label={t`Next image`}
          onClick={(e) => {
            e.stopPropagation();
            setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
          }}
        >
          <ChevronRight className="size-6" />
        </button>
      ) : null}

      <div className="poracode-image-lightbox__footer">
        <div className="poracode-image-lightbox__zoom">
          <button
            type="button"
            className="poracode-image-lightbox__zoom-button"
            aria-label={t`Zoom out`}
            disabled={scale <= MIN_SCALE}
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(-SCALE_STEP);
            }}
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="poracode-image-lightbox__zoom-value" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="poracode-image-lightbox__zoom-button"
            aria-label={t`Zoom in`}
            disabled={scale >= MAX_SCALE}
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(SCALE_STEP);
            }}
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
        {images.length > 1 ? (
          <span className="poracode-image-lightbox__counter">
            {index + 1} / {images.length}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function clampPan(
  point: Point,
  scale: number,
  stage: HTMLDivElement | null,
  image: HTMLImageElement | null,
): Point {
  if (!stage || !image || scale <= MIN_SCALE) return { x: 0, y: 0 };
  const maxX = Math.max(0, (image.clientWidth * scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (image.clientHeight * scale - stage.clientHeight) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, point.x)),
    y: Math.min(maxY, Math.max(-maxY, point.y)),
  };
}
