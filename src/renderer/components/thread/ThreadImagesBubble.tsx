import { Images } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { ThreadDockBubble } from "./ThreadDockUI";
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

  return (
    <ThreadDockBubble
      dataAttr="data-images-bubble"
      dataValue="true"
      label={label}
      showLabel={t`Show media`}
      active={panelShowing}
      icon={<Images className="size-3.5 shrink-0 text-muted" />}
      onPress={() => toggleThreadDocksPanel("images")}
    >
      <span className="[font-variant-numeric:tabular-nums]">{mediaCount}</span>
    </ThreadDockBubble>
  );
}
