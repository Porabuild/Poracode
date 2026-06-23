import { useCallback } from "react";
import { Trans } from "@lingui/react/macro";
import { ExternalLink, PictureInPicture2 } from "lucide-react";
import { useBrowserDockStore } from "@/renderer/state/browserDockStore";

/**
 * Right-panel browser tab content. The browser webview itself is rendered by
 * {@link BrowserHost} in a body portal; this component only marks the area it
 * should dock over (publishing the element to {@link useBrowserDockStore}), or
 * shows a placeholder while the browser lives in a separate window.
 */
export function BrowserDockSlot(props: {
  extracted: boolean;
  onBringBack: () => void;
  onFocusWindow: () => void;
}) {
  const setSlotEl = useBrowserDockStore((s) => s.setSlotEl);
  const slotRef = useCallback((el: HTMLDivElement | null) => setSlotEl(el), [setSlotEl]);

  if (props.extracted) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--content-background)] p-6 text-center">
        <PictureInPicture2 className="size-7 text-muted" aria-hidden />
        <div className="text-sm font-medium text-foreground">
          <Trans>Browser is open in a separate window</Trans>
        </div>
        <p className="max-w-[240px] text-xs text-muted">
          <Trans>Bring it back into this panel, or jump to the window it’s running in.</Trans>
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90"
            onClick={props.onBringBack}
          >
            <PictureInPicture2 className="size-3.5" aria-hidden />
            <Trans>Bring back to panel</Trans>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5"
            onClick={props.onFocusWindow}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            <Trans>Focus window</Trans>
          </button>
        </div>
      </div>
    );
  }

  return <div ref={slotRef} className="h-full w-full" />;
}
