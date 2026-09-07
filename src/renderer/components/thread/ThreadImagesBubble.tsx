import { Tooltip } from "@heroui/react";
import { Images } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import {
  floatingGlassActiveClass,
  floatingGlassBubbleActiveClass,
  floatingGlassBubbleClass,
  floatingGlassSurfaceClass,
} from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useThreadGalleryImages } from "./useThreadGalleryImages";

/**
 * Translucent image count that floats over the top-right corner of the
 * composer (next to the docks + changes bubbles). Clicking opens the thread
 * info panel at the image gallery; clicking again closes the panel.
 * Hidden when the loaded history holds no renderable image.
 */
export function ThreadImagesBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const gallery = useThreadGalleryImages(threadId);
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  if (gallery.length === 0) return null;
  const label = t`Images`;
  const bubble = (
    <button
      type="button"
      aria-label={panelShowing ? t`Hide ${label}` : t`Show images`}
      aria-pressed={panelShowing}
      data-images-bubble="true"
      className={`${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
        panelShowing ? `${floatingGlassActiveClass} ${floatingGlassBubbleActiveClass}` : ""
      }`}
      onClick={() => toggleThreadDocksPanel("images")}
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
