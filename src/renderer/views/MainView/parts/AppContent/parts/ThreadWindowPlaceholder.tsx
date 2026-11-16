import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ExternalLink, PictureInPicture2, X } from "lucide-react";
import { openThreadWindow, returnThreadToMainWindow } from "@/renderer/actions/threadWindowActions";
import { usePaneDragAndDrop } from "@/renderer/components/thread/PaneDragAndDrop";
import { ThreadActionIconButton } from "@/renderer/components/thread/ThreadActionIconButton";
import { ThreadDraftDropIndicators } from "@/renderer/components/thread/ThreadDraftChrome";
import { usePaneDropIndicatorState } from "@/renderer/dnd";
import { useThread } from "@/renderer/state/useThread";

/**
 * Stands in for a thread pane while the thread lives in its own window.
 * Closing the pane removes only the placeholder; the thread's window stays.
 */
export function ThreadWindowPlaceholder(props: { threadId: string; onClose: () => void }) {
  const { t } = useLingui();
  const thread = useThread(props.threadId);
  // Stays a drop target so other threads and panes can still replace or split it.
  const { paneElementRef } = usePaneDragAndDrop({ paneId: props.threadId, handleRendered: false });
  const dropIndicator = usePaneDropIndicatorState(props.threadId);
  if (!thread) return null;
  return (
    <div
      ref={paneElementRef}
      data-poracode-thread-window-placeholder=""
      className="relative flex h-full w-full flex-col bg-[var(--content-background)]"
    >
      <ThreadDraftDropIndicators dropIndicator={dropIndicator} />
      {/* Same row height as a pane header, above the window drag strip. */}
      <div className="poracode-content-over-drag-region flex min-h-8 shrink-0 items-center justify-end px-2 py-1">
        <ThreadActionIconButton
          data-poracode-thread-close=""
          aria-label={t`Close pane`}
          className="text-muted/60 hover:text-foreground"
          onPress={props.onClose}
        >
          <X className="size-3.5" />
        </ThreadActionIconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
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
    </div>
  );
}
