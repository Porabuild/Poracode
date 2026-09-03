import { Tooltip } from "@heroui/react";
import { Images } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { openThreadGallery, useThreadGalleryImages } from "./useThreadGalleryImages";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";

/**
 * Translucent image count that floats over the top-right corner of the
 * composer (next to the docks + changes bubbles). Clicking opens the
 * thread-wide gallery in the fullscreen lightbox at the first image.
 * Hidden when the loaded history holds no renderable image.
 */
export function ThreadImagesBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const gallery = useThreadGalleryImages(threadId);
  if (gallery.length === 0) return null;
  const label = t`Images`;
  const bubble = (
    <button
      type="button"
      aria-label={t`Show images`}
      data-images-bubble="true"
      className={`${floatingGlassSurfaceClass} flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors hover:border-border/30`}
      onClick={() => openThreadGallery(gallery)}
    >
      <Images className="size-3.5 shrink-0 text-muted" />
      <span className="[font-variant-numeric:tabular-nums]">{gallery.length}</span>
    </button>
  );
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{bubble}</Tooltip.Trigger>
      <Tooltip.Content placement="top" className="max-w-[28rem] text-xs">
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}
