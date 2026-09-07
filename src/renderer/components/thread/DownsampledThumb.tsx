import { useEffect, useRef, useState } from "react";
import { downsampleLoadedImage } from "./imageThumbDownsample";

/** Device-pixel thumbnail after load so oversized rasters do not alias in a tiny tile. */
export function DownsampledThumb({
  src,
  alt,
  className,
  loading = "lazy",
  decoding = "async",
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
}) {
  const srcRef = useRef(src);
  const aliveRef = useRef(true);
  const [thumb, setThumb] = useState<{ source: string; url: string } | null>(null);
  const displaySrc = thumb?.source === src ? thumb.url : src;

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

  return (
    <img
      src={displaySrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      draggable={false}
      {...(className ? { className } : {})}
      onLoad={(event) => {
        if (displaySrc !== src) return;
        const expected = src;
        void downsampleLoadedImage(event.currentTarget).then((url) => {
          if (!aliveRef.current || srcRef.current !== expected) {
            if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
            return;
          }
          if (!url) {
            setThumb(null);
            return;
          }
          setThumb({ source: expected, url });
        });
      }}
    />
  );
}
