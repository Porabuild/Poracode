import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { Attachment } from "./useAttachments";

/** A pre-resolved image for the lightbox: a renderable URL plus an accessible label. */
export interface LightboxImage {
  /** Renderable image URL — a `data:`, `lightcode-local://`, or remote URL. */
  src: string;
  /** Accessible label / alt text. */
  alt?: string;
}

type LightboxState = {
  images: readonly LightboxImage[];
  initialIndex: number;
  nonce: number;
};

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
 * (`data:`, `lightcode-local://`, remote) so it can be reused for chat-generated
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
  const current = images[index];

  // Reset index if initialIndex changes (new lightbox open)
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

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

  if (!current) return null;

  return createPortal(
    <div // eslint-disable-line jsx-a11y/click-events-have-key-events -- keyboard nav handled via useEffect
      className="lightcode-image-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.alt ?? t`Image preview`}
    >
      <button
        type="button"
        className="lightcode-image-lightbox__close"
        aria-label={t`Close preview`}
        onClick={onClose}
      >
        <X className="size-5" />
      </button>

      {images.length > 1 ? (
        <button
          type="button"
          className="lightcode-image-lightbox__nav lightcode-image-lightbox__nav--prev"
          aria-label={t`Previous image`}
          onClick={(e) => {
            e.stopPropagation();
            setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
          }}
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop close */}
      <img
        className="lightcode-image-lightbox__image"
        src={current.src}
        alt={current.alt ?? ""}
        onClick={(e) => e.stopPropagation()}
        decoding="async"
        draggable={false}
      />

      {images.length > 1 ? (
        <button
          type="button"
          className="lightcode-image-lightbox__nav lightcode-image-lightbox__nav--next"
          aria-label={t`Next image`}
          onClick={(e) => {
            e.stopPropagation();
            setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
          }}
        >
          <ChevronRight className="size-6" />
        </button>
      ) : null}

      {images.length > 1 ? (
        <span className="lightcode-image-lightbox__counter">
          {index + 1} / {images.length}
        </span>
      ) : null}
    </div>,
    document.body,
  );
}
