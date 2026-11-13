import { Tooltip } from "@heroui/react";
import { FileText } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import {
  floatingBubbleActiveClass,
  floatingBubblePillClass,
} from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useThreadArtifacts } from "./threadArtifacts";

/**
 * Translucent file/artifact count that floats over the top-right corner of the
 * composer (next to the media and docks bubbles). Clicking opens the thread info
 * panel focused on Files & artifacts; clicking again closes the panel.
 */
export function ThreadArtifactsBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const artifacts = useThreadArtifacts(threadId);
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  if (artifacts.length === 0) return null;
  const label = t`Files & artifacts`;
  const bubble = (
    <button
      type="button"
      aria-label={panelShowing ? t`Hide ${label}` : t`Show files & artifacts`}
      aria-pressed={panelShowing}
      data-dock-bubble="artifacts"
      className={`${floatingBubblePillClass} px-2.5 ${
        panelShowing ? floatingBubbleActiveClass : ""
      }`}
      onClick={() => toggleThreadDocksPanel("artifacts")}
    >
      <FileText className="size-3.5 shrink-0 text-muted" />
      <span className="[font-variant-numeric:tabular-nums]">{artifacts.length}</span>
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
