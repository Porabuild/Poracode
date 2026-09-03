import { useLingui } from "@lingui/react/macro";
import type { ThreadGalleryImage } from "./ChatPane/parts/items/threadGalleryImages";
import { openThreadGallery } from "./useThreadGalleryImages";

/**
 * Right-panel "Images" section: a 2-row horizontal mosaic of every renderable
 * image in the thread's loaded history. Thumbnails lazy-load (`loading="lazy"`
 * + `decoding="async"`) so opening the panel never fetches off-screen bytes
 * up front; clicking any tile opens the fullscreen lightbox at that image with
 * prev/next across the whole thread.
 */
export function ThreadImagesDock({ gallery }: { gallery: readonly ThreadGalleryImage[] }) {
  const { t } = useLingui();
  if (gallery.length === 0) return null;
  return (
    <section aria-label={t`Images`} data-images-dock="true" className="min-w-0">
      <div className="flex items-center gap-2 px-1 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {t`Images`}
        </span>
        <span className="shrink-0 text-xs text-muted [font-variant-numeric:tabular-nums]">
          {gallery.length}
        </span>
      </div>
      <div
        className="grid auto-cols-max grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto pb-1 [scrollbar-gutter:stable]"
        role="list"
        aria-label={t`Thread images`}
      >
        {gallery.map((img, index) => (
          <div key={`${img.src.slice(0, 64)}:${index}`} role="listitem" className="shrink-0">
            <button
              type="button"
              aria-label={t`Open image ${index + 1} of ${gallery.length}`}
              title={img.alt || t`Open image preview`}
              className="group relative block h-16 w-24 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[var(--composer-surface)] transition-colors hover:border-border/60 focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => openThreadGallery(gallery, undefined, index)}
            >
              <img
                src={img.src}
                alt={img.alt || ""}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-cover"
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
