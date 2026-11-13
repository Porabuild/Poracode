import { Tooltip } from "@heroui/react";
import { Images } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import {
  floatingBubbleActiveClass,
  floatingBubblePillClass,
} from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useThreadGalleryImages } from "./useThreadGalleryImages";
import { useThreadVideos } from "./threadVideos";

/**
 * Translucent media count that floats over the top-right corner of the
 * composer (next to the files & artifacts + docks bubbles). Clicking opens the
 * thread info panel at the Media section; clicking again closes the panel.
 * Hidden when the loaded history holds no renderable image or video.
 *
 * Count-only: pending host-held images count toward the total but are NOT
 * fetched here. Fetching the whole history from this always-mounted bubble
 * filled the bounded image queue with offscreen images on every thread
 * open, ahead of the transcript cards in view. The dock fetches on open.
 */
export function ThreadImagesBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const gallery = useThreadGalleryImages(threadId, { lightbox: true, requestPending: false });
  const videos = useThreadVideos(threadId);
  const mediaCount = gallery.length + videos.length;
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  if (mediaCount === 0) return null;
  const label = t`Media`;
  const bubble = (
    <button
      type="button"
      aria-label={panelShowing ? t`Hide ${label}` : t`Show media`}
      aria-pressed={panelShowing}
      data-images-bubble="true"
      className={`${floatingBubblePillClass} px-2.5 ${
        panelShowing ? floatingBubbleActiveClass : ""
      }`}
      onClick={() => toggleThreadDocksPanel("images")}
    >
      <Images className="size-3.5 shrink-0 text-muted" />
      <span className="[font-variant-numeric:tabular-nums]">{mediaCount}</span>
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
