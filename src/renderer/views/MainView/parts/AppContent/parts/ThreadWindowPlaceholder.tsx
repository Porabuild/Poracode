import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { ExternalLink, PictureInPicture2 } from "lucide-react";
import { openThreadWindow, returnThreadToMainWindow } from "@/renderer/actions/threadWindowActions";
import { usePaneDragAndDrop } from "@/renderer/components/thread/PaneDragAndDrop";
import { ThreadDraftDropIndicators } from "@/renderer/components/thread/ThreadDraftChrome";
import { usePaneDropIndicatorState } from "@/renderer/dnd";
import { useThread } from "@/renderer/state/useThread";

/** Stands in for a thread pane while the thread lives in its own window. */
export function ThreadWindowPlaceholder(props: { threadId: string }) {
  const thread = useThread(props.threadId);
  // Stays a drop target so other threads and panes can still replace or split it.
  const { paneElementRef } = usePaneDragAndDrop({ paneId: props.threadId, handleRendered: false });
  const dropIndicator = usePaneDropIndicatorState(props.threadId);
  if (!thread) return null;
  return (
    <div
      ref={paneElementRef}
      data-poracode-thread-window-placeholder=""
      className="relative flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--content-background)] p-6 text-center"
    >
      <ThreadDraftDropIndicators dropIndicator={dropIndicator} />
      <PictureInPicture2 className="size-7 text-muted" aria-hidden />
      <div className="max-w-[320px] truncate text-sm font-medium text-foreground">
        {thread.title}
      </div>
      <p className="max-w-[260px] text-xs text-muted">
        <Trans>This thread is open in a separate window.</Trans>
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Button size="sm" onPress={() => returnThreadToMainWindow(thread.id)}>
          <PictureInPicture2 className="size-3.5" aria-hidden />
          <Trans>Bring back to main window</Trans>
        </Button>
        <Button size="sm" variant="secondary" onPress={() => openThreadWindow(thread)}>
          <ExternalLink className="size-3.5" aria-hidden />
          <Trans>Focus window</Trans>
        </Button>
      </div>
    </div>
  );
}
