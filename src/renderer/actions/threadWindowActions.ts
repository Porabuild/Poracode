import { toast } from "@heroui/react";
import type { Thread } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { hasAnyClientBridge } from "@/renderer/clientRuntime";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";

/** Only the desktop main window can move a thread into its own window. */
export function canOpenThreadWindow(): boolean {
  if (!hasAnyClientBridge()) return false;
  const bridge = readBridge();
  return bridge.windowKind === "main" && bridge.openThreadWindow !== undefined;
}

/** Opens the thread in its own window, or focuses the window it already has. */
export function openThreadWindow(thread: Thread): void {
  void (async () => {
    // The new window reads the draft from storage as it starts, so text whose
    // save is still waiting out the typing delay is written first.
    await composerDraftStorage()
      ?.flushDraft("thread", thread.id)
      .catch((error: unknown) => captureRendererException(error, { featureArea: "thread-window" }));
    await readBridge().openThreadWindow?.({
      threadId: thread.id,
      title: thread.title,
      ...(thread.remoteServerId ? { remoteServerId: thread.remoteServerId } : {}),
    });
  })().catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** Closes the thread's window; the main window shows the thread once it has closed. */
export function returnThreadToMainWindow(threadId: string): void {
  void readBridge()
    .closeThreadWindow?.(threadId)
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** Closes the window of an archived, done or deleted thread and leaves the main window as it is. */
export function dismissThreadWindow(threadId: string): void {
  void readBridge()
    .closeThreadWindow?.(threadId, { returnToMain: false })
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}
