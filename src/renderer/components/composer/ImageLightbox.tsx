import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { Attachment } from "./useAttachments";

/** A pre-resolved image for the lightbox: a renderable URL plus an accessible label. */
export interface LightboxImage {
  /** Renderable image URL — a `data:`, `lightcode-local://`, or remote URL. */
  src: string;
  /** Accessible label / alt text. */
  alt?: string;
}

/**
 * Attachment-backed lightbox used by the composer surfaces. Resolves each
 * attachment's local path to a renderable URL and defers to
 * {@link ImageLightboxView}.
 */
export function ImageLightbox(props: {
  images: Attachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const images = useMemo<LightboxImage[]>(
    () => props.images.map((img) => ({ src: toLocalFileUrl(img.path), alt: img.name })),
    [props.images],
  );
  return (
    <ImageLightboxView images={images} initialIndex={props.initialIndex} onClose={props.onClose} />
  );
}

/**
 * Source-agnostic fullscreen image viewer. Accepts already-resolved image URLs
 * (`data:`, `lightcode-local://`, remote) so it can be reused for chat-generated
 * images as well as composer attachments. Supports keyboard nav and prev/next
 * chrome for multi-image galleries; a single image renders without that chrome.
 */
export function ImageLightboxView(props: {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
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
      aria-label={current.alt ?? "Image preview"}
    >
      <button
        type="button"
        className="lightcode-image-lightbox__close"
        aria-label="Close preview"
        onClick={onClose}
      >
        <X className="size-5" />
      </button>

      {images.length > 1 ? (
        <button
          type="button"
          className="lightcode-image-lightbox__nav lightcode-image-lightbox__nav--prev"
          aria-label="Previous image"
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
        draggable={false}
      />

      {images.length > 1 ? (
        <button
          type="button"
          className="lightcode-image-lightbox__nav lightcode-image-lightbox__nav--next"
          aria-label="Next image"
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
