import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { localImageThumbUrl } from "@/shared/localImageThumb";
import { downsampleLoadedImage } from "./imageThumbDownsample";

/**
 * Small-tile source for `src`, sized for a tile up to `cssPx` CSS pixels.
 * Desktop local files load a host-resized thumbnail directly. Other sources
 * paint `src` first, then swap in a device-pixel thumbnail once it loads; wire
 * `onLoad` to the same <img> that renders `displaySrc`.
 */
export function useDownsampledImageSrc(src: string, cssPx: number) {
  const localThumb = localImageThumbUrl(src, cssPx * (window.devicePixelRatio || 1));
  const srcRef = useRef(src);
  const aliveRef = useRef(true);
  const [thumb, setThumb] = useState<{ source: string; url: string } | null>(null);
  const displaySrc = localThumb ?? (thumb?.source === src ? thumb.url : src);

  useEffect(() => {
    aliveRef.current = true;
    srcRef.current = src;
    return () => {
      aliveRef.current = false;
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (thumb?.url.startsWith("blob:")) URL.revokeObjectURL(thumb.url);
    };
  }, [thumb]);

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (displaySrc !== src) return;
    const expected = src;
    void downsampleLoadedImage(event.currentTarget).then((url) => {
      if (!aliveRef.current || srcRef.current !== expected) {
        if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
        return;
      }
      setThumb(url ? { source: expected, url } : null);
    });
  };

  return { displaySrc, onLoad };
}
