import { useState } from "react";
import { ChevronDown, Images } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadGalleryImage } from "./ChatPane/parts/items/threadGalleryImages";
import { openThreadGallery } from "./useThreadGalleryImages";
import { ThreadDockHeader, ThreadDockIconButton, ThreadDockSection } from "./ThreadDockUI";

/**
 * Right-panel "Images" section: a 2-row horizontal mosaic of every renderable
 * image in the thread's loaded history, newest first. Thumbnails lazy-load
 * (`loading="lazy"` + `decoding="async"`) so opening the panel never fetches
 * off-screen bytes up front; clicking any tile opens the fullscreen lightbox
 * at that image with prev/next across the whole thread.
 */
export function ThreadImagesDock({ gallery }: { gallery: readonly ThreadGalleryImage[] }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(false);
  if (gallery.length === 0) return null;
  return (
    <ThreadDockSection
      placement="right"
      collapsed={collapsed}
      ariaLabel={t`Images`}
      className="min-w-0 [&[data-placement='right']]:h-auto"
    >
      <div data-images-dock="true" className="min-w-0">
        <ThreadDockHeader
          icon={Images}
          title={t`Images`}
          countLabel={<span className="[font-variant-numeric:tabular-nums]">{gallery.length}</span>}
          actions={
            <ThreadDockIconButton
              label={collapsed ? t`Expand images` : t`Collapse images`}
              tooltip={collapsed ? t`Expand` : t`Collapse`}
              onPress={() => setCollapsed(!collapsed)}
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
              />
            </ThreadDockIconButton>
          }
        />
        {!collapsed ? (
          <div className="px-1 pb-1">
            <div
              className="grid auto-cols-max grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto pb-1 [scrollbar-gutter:stable]"
              role="list"
              aria-label={t`Thread images`}
            >
              {gallery.map((img, index) => (
                <div key={img.src} role="listitem" className="shrink-0">
                  <button
                    type="button"
                    aria-label={t`Open image ${index + 1} of ${gallery.length}`}
                    title={img.alt || t`Open image preview`}
                    className="group relative block h-16 w-24 overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--composer-surface)] focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => openThreadGallery(gallery, undefined, index)}
                  >
                    <img
                      src={img.src}
                      alt={img.alt || ""}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="size-full rounded-[inherit] object-cover [image-rendering:auto]"
                    />
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
