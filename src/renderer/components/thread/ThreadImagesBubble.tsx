import { Tooltip } from "@heroui/react";
import { FileText, Images } from "lucide-react";
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
import { useThreadArtifacts } from "./threadArtifacts";

/**
 * Translucent image count that floats over the top-right corner of the
 * composer (next to the docks + changes bubbles). Clicking opens the thread
 * info panel at the image gallery; clicking again closes the panel.
 * Hidden when the loaded history holds no renderable image.
 *
 * Count-only: pending host-held images count toward the total but are NOT
 * fetched here. Fetching the whole history from this always-mounted bubble
 * filled the bounded image queue with offscreen images on every thread
 * open, ahead of the transcript cards in view. The dock fetches on open.
 */
export function ThreadImagesBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const gallery = useThreadGalleryImages(threadId, { lightbox: true, requestPending: false });
  const imageCount = gallery.length;
  const artifacts = useThreadArtifacts(threadId);
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  if (imageCount === 0 && artifacts.length === 0) return null;
  const label = artifacts.length > 0 ? t`Files & artifacts` : t`Images`;
  const bubble = (
    <button
      type="button"
      aria-label={
        panelShowing
          ? t`Hide ${label}`
          : artifacts.length > 0
            ? t`Show files & artifacts`
            : t`Show images`
      }
      aria-pressed={panelShowing}
      data-images-bubble="true"
      className={`${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
        panelShowing ? `${floatingGlassActiveClass} ${floatingGlassBubbleActiveClass}` : ""
      }`}
      onClick={() => toggleThreadDocksPanel("images")}
    >
      {artifacts.length > 0 ? (
        <FileText className="size-3.5 shrink-0 text-muted" />
      ) : (
        <Images className="size-3.5 shrink-0 text-muted" />
      )}
      <span className="[font-variant-numeric:tabular-nums]">{imageCount + artifacts.length}</span>
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
