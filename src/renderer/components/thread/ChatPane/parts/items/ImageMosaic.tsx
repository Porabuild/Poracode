import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { RemoteImageCard } from "./RemoteImageCard";
import type { ImageViewSource } from "./imageViewSource";

export const MAX_MOSAIC_VISIBLE_TILES = 6;
const MAX_OVERFLOW_POPOVER_TILES = 9;

const SM_BREAKPOINT_PX = 640;
const MOSAIC_GAP_REM = 0.375; // gap-1.5
const MOSAIC_COLS_MOBILE = 2; // grid-cols-2
const MOSAIC_COLS_SM = 3; // sm:grid-cols-3
const MOSAIC_TILE_HEIGHT_REM_MOBILE = 8; // h-32
const MOSAIC_TILE_HEIGHT_REM_SM = 10; // sm:h-40

const MOSAIC_CONTAINER_CLASS = "grid w-full max-w-[40rem] grid-cols-2 sm:grid-cols-3 gap-1.5";
const MOSAIC_TILE_CLASS = "min-w-0 h-32 sm:h-40";

const OVERFLOW_POPOVER_OPEN_DELAY_MS = 140;
const OVERFLOW_POPOVER_CLOSE_DELAY_MS = 180;
const OVERFLOW_POPOVER_TILE_HEIGHT_PX = 96; // h-24
const OVERFLOW_POPOVER_GAP_PX = 6; // gap-1.5
const OVERFLOW_POPOVER_PADDING_PX = 16; // p-2 top + bottom
const OVERFLOW_POPOVER_OFFSET_PX = 8;
const OVERFLOW_POPOVER_MARGIN_PX = 12;

/**
 * Predict the fixed rendered height of an `ImageMosaic` (2+ images) in pixels
 * from the same Tailwind grid/height tokens used below, so virtualized history
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
  const cols = isSm ? MOSAIC_COLS_SM : MOSAIC_COLS_MOBILE;
  const tileHeightRem = isSm ? MOSAIC_TILE_HEIGHT_REM_SM : MOSAIC_TILE_HEIGHT_REM_MOBILE;
  const rows = Math.ceil(visibleCount / cols);
  const rem = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
  const totalRem = rows * tileHeightRem + (rows - 1) * MOSAIC_GAP_REM;
  return Math.round(totalRem * rem);
}

interface ImageMosaicProps {
  readonly sources: readonly ImageViewSource[];
  /** Number of adjacent in-flight image tool calls reserving skeleton tiles. */
  readonly pendingTileCount?: number;
  readonly className?: string;
}

/**
 * Renders 1 image as the standard inline card, or 2+ sequential/bundled images
 * as a uniform monotonic grid (2-col mobile, 3-col desktop, fixed tile height,
 * up to 6 visible tiles + a `+N` overflow badge with a hover mini-mosaic
 * popover) so already-rendered tiles never resize, reflow, or unmount as
 * additional images arrive.
 */
export const ImageMosaic = memo(function ImageMosaic({
  sources,
  pendingTileCount = 0,
  className,
}: ImageMosaicProps) {
  if (sources.length === 0) return null;

  const safePendingCount = Math.max(0, pendingTileCount);
  const totalCount = sources.length + safePendingCount;
  const isMosaic = totalCount >= 2;
  const visible = sources.slice(0, MAX_MOSAIC_VISIBLE_TILES);
  const overflowSources = sources.slice(MAX_MOSAIC_VISIBLE_TILES);
  const overflowCount = overflowSources.length;
  const visiblePendingCount = isMosaic
    ? Math.min(safePendingCount, Math.max(0, MAX_MOSAIC_VISIBLE_TILES - visible.length))
    : 0;

  // Keep the same outer `<div>` + keyed tile `<div>` + `<RemoteImageCard>` tree
  // across `1 -> 2` so tile 0 switches from inline to tile layout in place
  // without unmounting or re-decoding its `<img>`.
  return (
    <div
      {...(isMosaic
        ? {
            "data-poracode-image-mosaic": "true",
            "data-mosaic-count": totalCount,
          }
        : {})}
      className={
        isMosaic ? `${MOSAIC_CONTAINER_CLASS}${className ? ` ${className}` : ""}` : className
      }
    >
      {visible.map((source, index) => {
        const isOverflowTile = isMosaic && overflowCount > 0 && index === visible.length - 1;
        if (isOverflowTile) {
          return (
            <OverflowTileWithPopover
              key={mosaicTileKey(source, index)}
              source={source}
              overflowSources={overflowSources}
              tileClassName={MOSAIC_TILE_CLASS}
            />
          );
        }
        return (
          <div
            key={mosaicTileKey(source, index)}
            className={isMosaic ? MOSAIC_TILE_CLASS : undefined}
          >
            <RemoteImageCard source={source} layout={isMosaic ? "tile" : "inline"} />
          </div>
        );
      })}
      {Array.from({ length: visiblePendingCount }, (_, index) => (
        <div
          key={`pending:${index}`}
          data-poracode-mosaic-pending="true"
          aria-hidden="true"
          className={`${MOSAIC_TILE_CLASS} overflow-hidden content-surface animate-pulse bg-black/10`}
        />
      ))}
    </div>
  );
});

interface AnchorRect {
  readonly top: number;
  readonly bottom: number;
  readonly right: number;
}

interface PopoverCoords {
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

function computePopoverCoords(
  rect: AnchorRect,
  popoverCols: number,
  tileCount: number,
): PopoverCoords {
  const preferredWidth = popoverCols === 1 ? 140 : popoverCols === 2 ? 240 : 352;
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  const maxViewportWidth = Math.max(0, viewportWidth - OVERFLOW_POPOVER_MARGIN_PX * 2);
  const width = Math.min(preferredWidth, maxViewportWidth || preferredWidth);
  const rows = Math.ceil(tileCount / popoverCols);
  const estimatedHeight =
    rows * OVERFLOW_POPOVER_TILE_HEIGHT_PX +
    (rows - 1) * OVERFLOW_POPOVER_GAP_PX +
    OVERFLOW_POPOVER_PADDING_PX;
  const aboveTop = rect.top - OVERFLOW_POPOVER_OFFSET_PX - estimatedHeight;
  const belowTop = rect.bottom + OVERFLOW_POPOVER_OFFSET_PX;
  const fitsAbove = aboveTop >= OVERFLOW_POPOVER_MARGIN_PX;
  const fitsBelow = belowTop + estimatedHeight <= viewportHeight - OVERFLOW_POPOVER_MARGIN_PX;
  const rawTop = fitsAbove || !fitsBelow ? aboveTop : belowTop;
  const top = Math.max(
    OVERFLOW_POPOVER_MARGIN_PX,
    Math.min(rawTop, viewportHeight - estimatedHeight - OVERFLOW_POPOVER_MARGIN_PX),
  );
  const rawLeft = rect.right - width;
  const left = Math.max(
    OVERFLOW_POPOVER_MARGIN_PX,
    Math.min(rawLeft, viewportWidth - width - OVERFLOW_POPOVER_MARGIN_PX),
  );
  return { top: Math.round(top), left: Math.round(left), width: Math.round(width) };
}

function OverflowTileWithPopover({
  source,
  overflowSources,
  tileClassName,
}: {
  readonly source: ImageViewSource;
  readonly overflowSources: readonly ImageViewSource[];
  readonly tileClassName: string;
}) {
  const { t } = useLingui();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  const overflowCount = overflowSources.length;
  const visiblePopoverSources = overflowSources.slice(0, MAX_OVERFLOW_POPOVER_TILES);
  const hiddenPopoverOverflow = overflowCount - visiblePopoverSources.length;
  const popoverCols =
    visiblePopoverSources.length === 1 ? 1 : visiblePopoverSources.length === 2 ? 2 : 3;
  const popoverCoords = anchorRect
    ? computePopoverCoords(anchorRect, popoverCols, visiblePopoverSources.length)
    : null;

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== undefined) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = undefined;
    }
    if (closeTimerRef.current !== undefined) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  const closeImmediately = useCallback(() => {
    clearTimers();
    setAnchorRect(null);
  }, [clearTimers]);

  const openNow = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setAnchorRect({ top: rect.top, bottom: rect.bottom, right: rect.right });
  }, []);

  const scheduleOpen = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") return;
      if (closeTimerRef.current !== undefined) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = undefined;
      }
      if (anchorRect !== null) return;
      if (openTimerRef.current !== undefined) clearTimeout(openTimerRef.current);
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = undefined;
        openNow();
      }, OVERFLOW_POPOVER_OPEN_DELAY_MS);
    },
    [anchorRect, openNow],
  );

  const scheduleClose = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (openTimerRef.current !== undefined) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = undefined;
    }
    if (closeTimerRef.current !== undefined) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = undefined;
      setAnchorRect(null);
    }, OVERFLOW_POPOVER_CLOSE_DELAY_MS);
  }, []);

  const cancelClose = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (closeTimerRef.current !== undefined) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (anchorRect === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImmediately();
    };
    const handleViewportChange = () => closeImmediately();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [anchorRect, closeImmediately]);

  const popoverGridClass =
    popoverCols === 1
      ? "grid grid-cols-1 gap-1.5"
      : popoverCols === 2
        ? "grid grid-cols-2 gap-1.5"
        : "grid grid-cols-3 gap-1.5";

  return (
    <div
      ref={anchorRef}
      className={tileClassName}
      onPointerEnter={scheduleOpen}
      onPointerLeave={scheduleClose}
    >
      <RemoteImageCard
        source={source}
        layout="tile"
        overflowCount={overflowCount}
        onPreviewOpen={closeImmediately}
        overlay={
          <span
            data-poracode-mosaic-overflow="true"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold tabular-nums text-white backdrop-blur-[2px]"
          >
            +{overflowCount}
          </span>
        }
      />
      {popoverCoords !== null && typeof document !== "undefined"
        ? createPortal(
            <div
              data-poracode-mosaic-overflow-popover="true"
              role="region"
              aria-label={t`Open image preview (+${overflowCount} more)`}
              className="fixed z-50 rounded-4xl border border-[var(--hairline)] bg-[var(--overlay)] p-2 shadow-xl"
              style={{
                top: popoverCoords.top,
                left: popoverCoords.left,
                width: popoverCoords.width,
              }}
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
            >
              <div className={popoverGridClass}>
                {visiblePopoverSources.map((hiddenSource, hiddenIndex) => {
                  const isPopoverOverflow =
                    hiddenPopoverOverflow > 0 && hiddenIndex === visiblePopoverSources.length - 1;
                  return (
                    <div
                      key={mosaicTileKey(hiddenSource, MAX_MOSAIC_VISIBLE_TILES + hiddenIndex)}
                      className="min-w-0 h-24"
                    >
                      <RemoteImageCard
                        source={hiddenSource}
                        layout="tile"
                        showActions={false}
                        persistPreviewUpgrade
                        onPreviewOpen={closeImmediately}
                        {...(isPopoverOverflow
                          ? {
                              overflowCount: hiddenPopoverOverflow,
                              overlay: (
                                <span
                                  data-poracode-mosaic-popover-overflow="true"
                                  aria-hidden="true"
                                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold tabular-nums text-white backdrop-blur-[2px]"
                                >
                                  +{hiddenPopoverOverflow}
                                </span>
                              ),
                            }
                          : {})}
                      />
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function mosaicTileKey(source: ImageViewSource, index: number): string {
  if (source.remoteRef) {
    return `${source.remoteRef.itemId}:${JSON.stringify(source.remoteRef.path)}:${index}`;
  }
  return `${source.src.slice(0, 64)}:${index}`;
}
