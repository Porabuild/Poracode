import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { localImageThumbUrl } from "@/shared/localImageThumb";
import { downsampleLoadedImage, type ImageThumbOptions } from "./imageThumbDownsample";

/**
 * Small-tile source for `src`, sized for a tile up to `cssPx` CSS pixels.
 * Desktop local files load a host-resized thumbnail directly. Other sources
 * paint `src` first, then swap in a device-pixel thumbnail once it loads; wire
 * `onLoad` to the same <img> that renders `displaySrc`.
 */
export function useDownsampledImageSrc(
  src: string,
  cssPx: number,
  options: ImageThumbOptions = {},
) {
  const scale =
    options.resolutionScale !== undefined &&
    Number.isFinite(options.resolutionScale) &&
    options.resolutionScale > 0
      ? options.resolutionScale
      : 1;
  const dpr = (window.devicePixelRatio || 1) * scale;
  const fit = options.fit === "contain" ? "contain" : "cover";
  // Results are keyed to the full request so a stale bitmap can never swap
  // into a tile whose source, size, fit, or resolution changed mid-flight.
  const requestKey = `${src}|${cssPx}|${fit}|${scale}|${window.devicePixelRatio || 1}`;
  const localThumb = localImageThumbUrl(src, cssPx * dpr);
  const requestRef = useRef(requestKey);
  const aliveRef = useRef(true);
  const [thumb, setThumb] = useState<{ key: string; url: string } | null>(null);
  const displaySrc = localThumb ?? (thumb?.key === requestKey ? thumb.url : src);

  useEffect(() => {
    aliveRef.current = true;
    requestRef.current = requestKey;
    return () => {
      aliveRef.current = false;
    };
  }, [requestKey]);

  useEffect(() => {
    return () => {
      if (thumb?.url.startsWith("blob:")) URL.revokeObjectURL(thumb.url);
    };
  }, [thumb]);

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (displaySrc !== src) return;
    const expected = requestKey;
    void downsampleLoadedImage(event.currentTarget, { fit, resolutionScale: scale }).then((url) => {
      if (!aliveRef.current || requestRef.current !== expected) {
        if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
        return;
      }
      setThumb(url ? { key: expected, url } : null);
    });
  };

  return { displaySrc, onLoad };
}
