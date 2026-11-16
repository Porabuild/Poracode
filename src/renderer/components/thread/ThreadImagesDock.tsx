import { useEffect, useState, useSyncExternalStore } from "react";
import { Film, Images, Play } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { openImageLightbox } from "@/renderer/components/composer/ImageLightbox";
import { useImageViewportPriority } from "@/renderer/components/common/useImageViewportPriority";
import { useRenderOnNotify } from "@/renderer/state/remoteServers/useRemoteImageReadiness";
import type { ThreadGalleryImage } from "./ChatPane/parts/items/threadGalleryImages";
import { DownsampledThumb } from "./DownsampledThumb";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";
import { threadVideosForLightbox, type ThreadVideo } from "./threadVideos";

const EMPTY_VIDEOS: readonly ThreadVideo[] = [];
const subscribeEmptyImage = () => () => undefined;
const emptyImageSnapshot = () => "";

/**
 * Right-panel "Media" section (formerly "Images"): a 2-row horizontal mosaic
 * of images followed by videos, each newest first in the loaded history.
 * Image thumbnails lazy-load and downsample to a 2x device-pixel cover
 * rect; video tiles show a compact play badge + filename. Clicking any tile opens
 * the fullscreen lightbox at that item with prev/next across the media gallery.
 */
export function ThreadImagesDock({
  gallery,
  videos = EMPTY_VIDEOS,
  threadId,
  visible = true,
}: {
  gallery: readonly ThreadGalleryImage[];
  videos?: readonly ThreadVideo[];
  /** Enables live gallery updates in the open lightbox when provided. */
  threadId?: string | undefined;
  visible?: boolean;
}) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(false);
  const totalCount = gallery.length + videos.length;
  if (totalCount === 0) return null;
  const label = t`Media`;

  function openMediaAt(index: number) {
    openImageLightbox(
      [...gallery, ...threadVideosForLightbox(videos, threadId)],
      index,
      threadId ? { liveThreadId: threadId, includeThreadVideos: true } : undefined,
    );
  }

  return (
    <ThreadDockSection
      placement="right"
      collapsed={collapsed}
      ariaLabel={label}
      className="min-w-0 [&[data-placement='right']]:h-auto"
    >
      <div data-images-dock="true" className="min-w-0">
        <ThreadDockHeader
          icon={Images}
          title={label}
          collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
          countLabel={<span className="[font-variant-numeric:tabular-nums]">{totalCount}</span>}
          actions={
            <ThreadDockCollapseButton
              collapsed={collapsed}
              label={collapsed ? t`Expand media` : t`Collapse media`}
              onPress={() => setCollapsed(!collapsed)}
            />
          }
        />
        {!collapsed ? (
          <div className="px-1 pb-1">
            <div
              className="grid auto-cols-max grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto pb-1 [scrollbar-gutter:stable]"
              role="list"
              aria-label={t`Thread media`}
            >
              {gallery.map((img, index) => (
                <div key={img.resource?.key ?? img.src} role="listitem" className="shrink-0">
                  <button
                    type="button"
                    aria-label={t`Open image ${index + 1} of ${gallery.length}`}
                    title={img.alt || t`Open image preview`}
                    className="group relative block h-24 w-40 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--composer-surface)] focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => openMediaAt(index)}
                  >
                    <ThreadImageThumbnail image={img} visible={visible} />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/0 transition-colors duration-150 group-hover:bg-foreground/10"
                    />
                  </button>
                </div>
              ))}
              {videos.map((video, index) => (
                <div key={video.target} role="listitem" className="shrink-0">
                  <button
                    type="button"
                    aria-label={t`Open video ${index + 1} of ${videos.length}: ${video.name}`}
                    title={video.name || t`Open video preview`}
                    className="group relative flex h-24 w-40 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--composer-surface)] focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => openMediaAt(gallery.length + index)}
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border border-foreground/15 bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-transform duration-150 group-hover:scale-105">
                      <Play className="size-3.5 translate-x-[1px] fill-current" />
                    </span>
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-2 pb-1.5 pt-4 text-left text-[11px] font-medium text-white">
                      <Film className="size-3 shrink-0 opacity-85" />
                      <span className="truncate">{video.name}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/0 transition-colors duration-150 group-hover:bg-foreground/10"
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ThreadDockSection>
  );
}

function ThreadImageThumbnail({ image, visible }: { image: ThreadGalleryImage; visible: boolean }) {
  const resource = image.resource;
  const { viewportRef, priority } = useImageViewportPriority(visible && resource !== undefined);
  const active = visible && resource !== undefined && priority === "foreground";
  const onNotify = useRenderOnNotify();
  const resolvedSrc = useSyncExternalStore(
    active
      ? (listener) => resource.subscribe(onNotify(listener), "foreground")
      : subscribeEmptyImage,
    active ? resource.getSnapshot : emptyImageSnapshot,
  );
  useEffect(() => {
    if (active && !resolvedSrc) resource.request("foreground");
  });
  const src = resource ? resolvedSrc : image.src;
  return (
    <span ref={viewportRef} className="block size-full">
      {src ? (
        <DownsampledThumb
          src={src}
          alt={image.alt || ""}
          cssPx={160}
          fit="cover"
          resolutionScale={2}
          className="size-full rounded-[inherit] object-cover [image-rendering:high-quality]"
        />
      ) : null}
    </span>
  );
}
