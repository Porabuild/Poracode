import { toast } from "@heroui/react";
import type { Thread } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";

/** Only the desktop main window can move a thread into its own window. */
export function canOpenThreadWindow(): boolean {
  const bridge = readBridge();
  return bridge.windowKind === "main" && bridge.openThreadWindow !== undefined;
}

/** Opens the thread in its own window, or focuses the window it already has. */
export function openThreadWindow(thread: Thread): void {
  void readBridge()
    .openThreadWindow?.({
      threadId: thread.id,
      title: thread.title,
      ...(thread.remoteServerId ? { remoteServerId: thread.remoteServerId } : {}),
    })
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** Closes the thread's window so the main window shows the thread again. */
export function returnThreadToMainWindow(threadId: string): void {
  void readBridge()
    .closeThreadWindow?.(threadId)
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** Closes the window of a deleted thread and leaves the main window as it is. */
export function dismissThreadWindow(threadId: string): void {
  void readBridge()
    .closeThreadWindow?.(threadId, { returnToMain: false })
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}
