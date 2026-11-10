import { useEffect, useEffectEvent } from "react";
import { useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import type { PickedBrowserAttachment } from "@/renderer/components/composer/useAttachments";

/**
 * Moves elements picked in the in-app browser for `inboxKey` (a thread id, or
 * a draft pane's inbox key) into a composer. `onPicked` may change on every
 * render; the latest one receives each drained item.
 */
export function useBrowserAttachInboxDrain(
  inboxKey: string,
  onPicked: (attachment: PickedBrowserAttachment) => void,
): void {
  const pending = useBrowserAttachInbox((state) => state.itemsByThread[inboxKey]);
  const deliver = useEffectEvent(onPicked);
  useEffect(() => {
    if (!pending || pending.length === 0) return;
    for (const item of useBrowserAttachInbox.getState().drain(inboxKey)) {
      deliver({
        path: item.attachmentPath,
        name: item.attachmentName,
        mimeType: item.mimeType,
        selector: item.selector,
        sourceUrl: item.sourceUrl,
      });
    }
  }, [pending, inboxKey]);
}
