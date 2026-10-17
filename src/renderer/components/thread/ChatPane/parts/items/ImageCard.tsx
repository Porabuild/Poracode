import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Copy, Download, Maximize2 } from "lucide-react";
import { memo, useState, type ReactNode, type Ref } from "react";
import { fetchImageBytes, toClipboardPngBytes } from "@/renderer/utils/imageActions";
import { readBridge } from "@/renderer/bridge";
import { openImageLightbox } from "@/renderer/components/composer/ImageLightbox";
import {
  getThreadGalleryImages,
  openThreadGallery,
} from "@/renderer/components/thread/useThreadGalleryImages";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { friendlyError } from "@/shared/messages";
import { chatInlineImageClass, reserveInlineImageSlot } from "./chatImageClass";
import type { ImageViewSource } from "./imageViewSource";

interface ImageCardProps {
  source: ImageViewSource;
  className?: string;
  imageClassName?: string;
  isBlock?: boolean;
  viewportRef?: Ref<HTMLSpanElement>;
}

/**
 * Shared interactive image used by tool results, message image blocks, and
 * markdown images. A span root keeps the card valid inside markdown paragraphs.
 */
export const ImageCard = memo(function ImageCard({
  source,
  className,
  imageClassName,
  isBlock = false,
  viewportRef,
}: ImageCardProps) {
  const { t } = useLingui();
  const imageAlt = source.alt || t`Image`;
  // Thread-wide gallery: opening any transcript image offers prev/next across
  // every image in the loaded history. Resolved click-time (no store
  // subscription) so rows never re-render on unrelated ticks. Falls back to a
  // single-image preview when rendered outside a thread.
  const threadId = useChatPaneActions()?.threadId;
  const openPreview = () => {
    if (!source.src) return;
    if (threadId) {
      const gallery = getThreadGalleryImages(threadId);
      if (gallery.some((img) => img.src === source.src)) {
        openThreadGallery(gallery, source.src, 0, threadId);
        return;
      }
    }
    openImageLightbox(
      [{ src: source.src, alt: imageAlt, mime: source.mime, fileName: source.fileName }],
      0,
    );
  };
  // Let the browser paint decoded images without waiting for React's load
  // handler. In particular, reopening a thread can mount an already-cached
  // image before its load event is delivered. Hiding it until that event adds
  // a blank frame and a fresh fade even though the bytes are already available.
  // An empty source keeps the reserved slot without issuing an <img src="">.
  const hasSource = source.src.length > 0;
  const isInline = source.src.startsWith("data:");
  // Reset for a replacement resource before it paints, without remounting the
  // card or briefly treating the new URI as the previous image's loaded state.
  const [loadState, setLoadState] = useState({ src: source.src, loaded: false });
  if (loadState.src !== source.src) setLoadState({ src: source.src, loaded: false });
  const loaded = isInline || (loadState.src === source.src && loadState.loaded);
  const showPreview = !loaded && Boolean(source.preview);
  // Reserve the final box up front so the transcript never reflows when a
  // fetched image lands. Inline `data:` images paint immediately and keep the
  // natural `w-auto` sizing.
  const reservedSlot = isInline ? undefined : reserveInlineImageSlot(source.width, source.height);

  return (
    <span
      ref={viewportRef}
      className={`poracode-image-card relative self-start ${isBlock ? "flex w-fit" : "inline-flex"} max-w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--composer-surface)]${className ? ` ${className}` : ""}`}
      data-poracode-image-card="true"
    >
      <button
        type="button"
        className="relative block cursor-zoom-in bg-black/20"
        aria-label={t`Open image preview`}
        disabled={!hasSource}
        onClick={openPreview}
      >
        {/* Blurred stand-in for a host-held image, painted in the slot the <img>
            has already reserved via its intrinsic width/height. Scaled past the
            edges so the blur has no visible border, and dropped from the tree
            once the real image loads. The image paints above it as soon as the
            browser decodes it, independently of React's load state. */}
        {showPreview ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 scale-110 bg-cover bg-center blur-lg"
            style={{ backgroundImage: `url("${source.preview!}")` }}
          />
        ) : null}
        {/* A new URL needs its own image element: browsers can retain the old
            bitmap while a replacement request loads. Keep the surrounding slot. */}
        {hasSource ? (
          <img
            key={source.src}
            src={source.src}
            alt={imageAlt}
            draggable={false}
            decoding="async"
            onLoad={() => setLoadState({ src: source.src, loaded: true })}
            onError={() => setLoadState({ src: source.src, loaded: true })}
            {...(source.width && source.height
              ? { width: source.width, height: source.height }
              : {})}
            {...(reservedSlot ? { style: reservedSlot } : {})}
            className={`${chatInlineImageClass} relative${imageClassName ? ` ${imageClassName}` : ""}`}
          />
        ) : (
          <span
            aria-hidden="true"
            className="block bg-black/10"
            {...(reservedSlot ? { style: reservedSlot } : {})}
          />
        )}
      </button>
      {hasSource ? (
        <span className="poracode-image-action-toolbar absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-black/50 p-0.5 backdrop-blur-sm transition-opacity duration-150">
          <CopyImageButton source={source} />
          <DownloadImageButton src={source.src} fileName={source.fileName} />
          <IconButton label={t`Open preview`} onClick={openPreview}>
            <Maximize2 className="size-3.5" />
          </IconButton>
        </span>
      ) : null}
    </span>
  );
});

function CopyImageButton({ source }: { source: ImageViewSource }) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      const data = await toClipboardPngBytes(source);
      const ok = await readBridge().copyImageToClipboard({ data });
      if (!ok) {
        console.warn("Clipboard rejected the image (unsupported format)");
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy image to clipboard", err);
      toast.danger(friendlyError(err));
    }
  }

  return (
    <IconButton label={copied ? t`Copied` : t`Copy image`} onClick={() => void onCopy()}>
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </IconButton>
  );
}

function DownloadImageButton({ src, fileName }: { src: string; fileName: string }) {
  const { t } = useLingui();
  async function onDownload() {
    try {
      const data = await fetchImageBytes(src);
      await readBridge().saveImageFile({ data, suggestedName: fileName });
    } catch (err) {
      console.error("Failed to save image", err);
      toast.danger(friendlyError(err));
    }
  }

  return (
    <IconButton label={t`Download image`} onClick={() => void onDownload()}>
      <Download className="size-3.5" />
    </IconButton>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-6 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/20 hover:text-white"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
