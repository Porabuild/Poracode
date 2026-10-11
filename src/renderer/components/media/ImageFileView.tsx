import { useState, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { openImageLightbox } from "@/renderer/components/composer/ImageLightbox";
import { MediaDetails } from "./MediaDetails";

/** SVG is also rendered through an image element, never inline DOM or a webview. */
export function ImageFileView(props: {
  src: string;
  fileName: string;
  sizeBytes?: number;
  fallback: ReactNode;
  readBytes?: () => Promise<Uint8Array<ArrayBuffer>>;
}) {
  const { t } = useLingui();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ src: string; width: number; height: number } | null>(
    null,
  );
  if (!props.src || failedSrc === props.src) return <>{props.fallback}</>;
  const dimensions = natural?.src === props.src ? natural : null;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="image-file-view">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <Button
          variant="ghost"
          className="h-full min-h-0 w-full min-w-0 cursor-zoom-in rounded-none p-0 hover:bg-transparent"
          aria-label={t`Open image preview`}
          onPress={() =>
            openImageLightbox(
              [
                {
                  src: props.src,
                  alt: props.fileName,
                  fileName: props.fileName,
                  ...(props.readBytes ? { readBytes: props.readBytes } : {}),
                },
              ],
              0,
            )
          }
        >
          <img
            src={props.src}
            alt={props.fileName}
            draggable={false}
            decoding="async"
            className="max-h-full max-w-full object-contain"
            onLoad={(event) =>
              setNatural({
                src: props.src,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setFailedSrc(props.src)}
          />
        </Button>
      </div>
      <MediaDetails
        {...(dimensions ? { width: dimensions.width, height: dimensions.height } : {})}
        {...(props.sizeBytes !== undefined ? { sizeBytes: props.sizeBytes } : {})}
      />
    </div>
  );
}
