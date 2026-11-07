import { useDownsampledImageSrc } from "./useDownsampledImageSrc";
import type { ImageThumbOptions } from "./imageThumbDownsample";

/** Device-pixel thumbnail after load so oversized rasters do not alias in a tiny tile. */
export function DownsampledThumb({
  src,
  alt,
  cssPx,
  className,
  loading = "lazy",
  decoding = "async",
  fit,
  resolutionScale,
}: {
  src: string;
  alt: string;
  /** Larger edge of the rendered tile in CSS pixels. */
  cssPx: number;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
} & ImageThumbOptions) {
  const { displaySrc, onLoad } = useDownsampledImageSrc(src, cssPx, {
    ...(fit ? { fit } : {}),
    ...(resolutionScale !== undefined ? { resolutionScale } : {}),
  });
  return (
    <img
      src={displaySrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      draggable={false}
      {...(className ? { className } : {})}
      onLoad={onLoad}
    />
  );
}
