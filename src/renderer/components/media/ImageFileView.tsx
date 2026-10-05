import { useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { openImageLightbox } from "@/renderer/components/composer/ImageLightbox";
import { formatBytes } from "@/shared/formatBytes";

/**
 * Read-only view of an image file opened in an editor: the image fit to the
 * available space, with its dimensions and file size underneath. Clicking the
 * image opens it in the lightbox for zooming. `fallback` replaces the view
 * when there is no URL or the image fails to decode.
 */
export function ImageFileView(props: {
  src: string;
  fileName: string;
  sizeBytes?: number | undefined;
  fallback: ReactNode;
}) {
  const { t } = useLingui();
  const { src, fileName, sizeBytes } = props;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ src: string; width: number; height: number } | null>(
    null,
  );

  if (!src || failedSrc === src) return <>{props.fallback}</>;

  const dimensions = natural?.src === src ? natural : null;
  const details = [
    dimensions ? `${dimensions.width} × ${dimensions.height}` : null,
    sizeBytes !== undefined ? formatBytes(sizeBytes) : null,
  ].filter((detail) => detail !== null);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="image-file-view">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <button
          type="button"
          className="flex max-h-full max-w-full cursor-zoom-in"
          aria-label={t`Open image preview`}
          onClick={() => openImageLightbox([{ src, alt: fileName, fileName }], 0)}
        >
          <img
            src={src}
            alt={fileName}
            draggable={false}
            decoding="async"
            className="max-h-full max-w-full object-contain"
            onLoad={(event) =>
              setNatural({
                src,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setFailedSrc(src)}
          />
        </button>
      </div>
      {details.length > 0 ? (
        <div className="shrink-0 border-t border-[color:var(--border)] px-3 py-1 text-xs text-muted tabular-nums">
          {details.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
