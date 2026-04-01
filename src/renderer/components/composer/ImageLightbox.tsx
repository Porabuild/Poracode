import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toLocalFileUrl, type Attachment } from "./useAttachments";

export function ImageLightbox(props: {
  images: Attachment[];
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
      aria-label={current.name ?? "Image preview"}
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
        src={toLocalFileUrl(current.path)}
        alt={current.name ?? ""}
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
