import { FileText } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { toggleThreadDocksPanel } from "@/renderer/actions/panelActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useThreadFilesAndArtifacts } from "./threadArtifacts";
import { ThreadDockBubble } from "./ThreadDockUI";

/**
 * Translucent file/artifact count that floats over the top-right corner of the
 * composer (next to the media and docks bubbles). Clicking opens the thread info
 * panel focused on Files (or Artifacts when only artifacts exist); clicking again
 * closes the panel.
 */
export function ThreadArtifactsBubble({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const { files, artifacts } = useThreadFilesAndArtifacts(threadId);
  const totalCount = files.length + artifacts.length;
  const panelShowing = usePanelStore((s) => s.threadDocksPanelOpen && s.rightPanelTab === "docks");
  if (totalCount === 0) return null;
  const hasFiles = files.length > 0;
  const hasArtifacts = artifacts.length > 0;
  const focusTarget = hasFiles ? "files" : "artifacts";
  const label =
    hasFiles && hasArtifacts ? t`Files & artifacts` : hasFiles ? t`Files` : t`Artifacts`;
  const showLabel = hasFiles && hasArtifacts ? t`Show files & artifacts` : undefined;

  return (
    <ThreadDockBubble
      dataValue="artifacts"
      label={label}
      {...(showLabel ? { showLabel } : {})}
      active={panelShowing}
      icon={<FileText className="size-3.5 shrink-0 text-muted" />}
      onPress={() => toggleThreadDocksPanel(focusTarget)}
    >
      <span className="[font-variant-numeric:tabular-nums]">{totalCount}</span>
    </ThreadDockBubble>
  );
}
