import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { openPullRequestEntry } from "../PullRequestsOverlay/list/openPullRequestEntry";
import { PrListPanel } from "../PullRequestsOverlay/list/PrListPanel";

/**
 * The review list as a page: the compact layout's utility page and the desktop
 * route. Selecting a review opens its detail in the pull-request overlay. In the
 * compact layout the list owns its bottom row (filter and sort, machine, refresh).
 */
export function PullRequestsView(
  props: {
    readonly remoteDesktopId?: string;
    readonly onRemoteDesktopChange?: (desktopId: string | null) => void;
  } = {},
) {
  const compact = useCompactLayout();
  return (
    <div className="h-full min-h-0">
      <PrListPanel
        remoteDesktopId={props.remoteDesktopId}
        onRemoteDesktopChange={props.onRemoteDesktopChange}
        selectedKey={null}
        onOpen={openPullRequestEntry}
        hideTitle={compact}
      />
    </div>
  );
}
