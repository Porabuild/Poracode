import { memo, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Download, Maximize2 } from "lucide-react";
import { Tooltip, toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ToolCallPayload } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { readBridge } from "@/renderer/bridge";
import { openImageLightbox } from "@/renderer/components/composer";
import { resolveImageViewSource, type ImageViewSource } from "./imageViewSource";
import { ToolCall } from "./ToolCall";

interface ImageViewProps {
  item: RuntimeChatItem;
}

/**
 * Renders an `image_view` tool call (e.g. Codex's `imageGeneration`) as an
 * inline picture in the chat — with copy / download actions and a click-to-zoom
 * lightbox — instead of dumping the raw base64 into a tool-call accordion.
 *
 * Falls back to the generic {@link ToolCall} row whenever the payload has no
 * renderable image (still running, errored, or a non-image "image" tool), so
 * progress and error states still surface normally.
 */
export const ImageView = memo(function ImageView({ item }: ImageViewProps) {
  const payload = item.payload as ToolCallPayload | undefined;
  const source = useMemo(() => resolveImageViewSource(payload), [payload]);

  if (!source || payload?.status === "error") {
    return <ToolCall item={item} />;
  }
  return <ImageCard source={source} />;
});

/**
 * Inline image card with a click-to-zoom lightbox and a copy / download / expand
 * toolbar that floats over the image. The toolbar (not a caption) carries the
 * actions because the picture isn't necessarily "generated" — it may just be
 * something the agent shared — so a "Generated image" label would be misleading.
 * The toolbar sits on a translucent backdrop so its icons stay legible over any
 * image, and reveals on hover / keyboard focus to keep the picture uncluttered.
 */
export const ImageCard = memo(function ImageCard({ source }: { source: ImageViewSource }) {
  const { t } = useLingui();
  const imageAlt = source.alt || t`Image`;
  const openPreview = () => openImageLightbox([{ src: source.src, alt: imageAlt }], 0);

  return (
    <figure
      className="lightcode-image-card group relative m-0 inline-flex max-w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[var(--composer-surface)]"
      data-lightcode-image-card="true"
    >
      <button
        type="button"
        className="block cursor-zoom-in bg-black/20"
        aria-label={t`Open image preview`}
        onClick={openPreview}
      >
        <img
          src={source.src}
          alt={imageAlt}
          draggable={false}
          decoding="async"
          {...(source.width && source.height ? { width: source.width, height: source.height } : {})}
          className="block max-h-[22rem] w-auto max-w-full object-contain"
        />
      </button>
      <div className="lightcode-image-action-toolbar pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-black/50 p-0.5 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        <CopyImageButton source={source} />
        <DownloadImageButton src={source.src} fileName={source.fileName} />
        <IconButton label={t`Open preview`} onClick={openPreview}>
          <Maximize2 className="size-3.5" />
        </IconButton>
      </div>
    </figure>
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
    <IconButton label={copied ? t`Copied` : t`Copy image`} onClick={onCopy}>
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
    <IconButton label={t`Download image`} onClick={onDownload}>
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
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label={label}
          className="flex size-6 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">{label}</Tooltip.Content>
    </Tooltip>
  );
}

async function fetchImageBytes(src: string) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Bytes to hand the OS clipboard. The native clipboard (Electron `nativeImage`)
 * only decodes PNG/JPEG, so those pass straight through; other raster formats
 * (GIF/WebP/BMP) are decoded and re-encoded to PNG via a canvas. If conversion
 * isn't possible (e.g. an unsized SVG), the raw bytes are returned and the main
 * process reports the empty-image case back so the UI doesn't fake success.
 */
async function toClipboardPngBytes(source: ImageViewSource) {
  if (source.mime === "image/png" || source.mime === "image/jpeg") {
    return fetchImageBytes(source.src);
  }
  try {
    const blob = await (await fetch(source.src)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0 || canvas.height === 0) return fetchImageBytes(source.src);
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!pngBlob) return fetchImageBytes(source.src);
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return fetchImageBytes(source.src);
  }
}
