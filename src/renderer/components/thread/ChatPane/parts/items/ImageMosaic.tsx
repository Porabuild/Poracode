import { memo } from "react";
import { RemoteImageCard } from "./RemoteImageCard";
import type { ImageViewSource } from "./imageViewSource";

export const MAX_MOSAIC_VISIBLE_TILES = 6;

const SM_BREAKPOINT_PX = 640;
const MOSAIC_GAP_REM = 0.375; // gap-1.5

/**
 * Predict the fixed rendered height of an `ImageMosaic` (2+ images) in pixels
 * from the same Tailwind height tokens used below, so virtualized history
 * prepends reserve the real mosaic height before mount.
 */
export function estimateImageMosaicHeightPx(
  imageCount: number,
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : SM_BREAKPOINT_PX,
  rootFontSize = 16,
): number | undefined {
  if (imageCount < 2) return undefined;
  const visibleCount = Math.min(imageCount, MAX_MOSAIC_VISIBLE_TILES);
  const isSm = viewportWidth >= SM_BREAKPOINT_PX;
  const rem = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
  let totalRem: number;
  switch (visibleCount) {
    case 2:
      totalRem = isSm ? 13 : 11; // h-44 sm:h-52
      break;
    case 3:
      totalRem = isSm ? 18 : 16; // h-64 sm:h-72
      break;
    case 4:
      totalRem = (isSm ? 11 : 9) * 2 + MOSAIC_GAP_REM; // 2 rows of h-36 sm:h-44
      break;
    case 5:
      totalRem = (isSm ? 11 : 9) + (isSm ? 9 : 7) + MOSAIC_GAP_REM; // h-36/44 + h-28/36
      break;
    default:
      totalRem = (isSm ? 9 : 7) * 2 + MOSAIC_GAP_REM; // 2 rows of h-28 sm:h-36
      break;
  }
  return Math.round(totalRem * rem);
}

interface ImageMosaicProps {
  readonly sources: readonly ImageViewSource[];
  readonly className?: string;
}

/**
 * Renders 1 image as the standard inline card, or 2+ sequential/bundled images
 * as a flush adaptive mosaic (2-up, 3-up hero+stack, 2x2, 2+3, or 3x2 with a
 * `+N` overflow tile that opens the fullscreen lightbox across all images).
 */
export const ImageMosaic = memo(function ImageMosaic({ sources, className }: ImageMosaicProps) {
  if (sources.length === 0) return null;
  if (sources.length === 1) {
    return (
      <RemoteImageCard source={sources[0]!} {...(className !== undefined ? { className } : {})} />
    );
  }

  const visible = sources.slice(0, MAX_MOSAIC_VISIBLE_TILES);
  const overflowCount = sources.length - visible.length;
  const count = visible.length;

  return (
    <div
      data-poracode-image-mosaic="true"
      data-mosaic-count={sources.length}
      className={`${mosaicContainerClass(count)}${className ? ` ${className}` : ""}`}
    >
      {visible.map((source, index) => {
        const isOverflowTile = overflowCount > 0 && index === visible.length - 1;
        return (
          <div key={mosaicTileKey(source, index)} className={mosaicTileClass(count, index)}>
            <RemoteImageCard
              source={source}
              layout="tile"
              {...(isOverflowTile
                ? {
                    overflowCount,
                    overlay: (
                      <span
                        data-poracode-mosaic-overflow="true"
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold tabular-nums text-white backdrop-blur-[2px]"
                      >
                        +{overflowCount}
                      </span>
                    ),
                  }
                : {})}
            />
          </div>
        );
      })}
    </div>
  );
});

function mosaicContainerClass(visibleCount: number): string {
  switch (visibleCount) {
    case 2:
    case 4:
      return "grid w-full max-w-[40rem] grid-cols-2 gap-1.5";
    case 3:
      return "grid h-64 sm:h-72 w-full max-w-[40rem] grid-cols-3 grid-rows-2 gap-1.5";
    case 5:
      return "grid w-full max-w-[40rem] grid-cols-6 gap-1.5";
    default:
      return "grid w-full max-w-[40rem] grid-cols-3 gap-1.5";
  }
}

function mosaicTileClass(visibleCount: number, index: number): string {
  switch (visibleCount) {
    case 2:
      return "min-w-0 h-44 sm:h-52";
    case 3:
      return index === 0 ? "min-w-0 col-span-2 row-span-2" : "min-w-0 col-span-1 row-span-1";
    case 4:
      return "min-w-0 h-36 sm:h-44";
    case 5:
      return index < 2 ? "min-w-0 col-span-3 h-36 sm:h-44" : "min-w-0 col-span-2 h-28 sm:h-36";
    default:
      return "min-w-0 h-28 sm:h-36";
  }
}

function mosaicTileKey(source: ImageViewSource, index: number): string {
  if (source.remoteRef) {
    return `${source.remoteRef.itemId}:${JSON.stringify(source.remoteRef.path)}:${index}`;
  }
  return `${source.src.slice(0, 64)}:${index}`;
}
