import { toast } from "@heroui/react";
import type { Thread } from "@/shared/contracts";
import type { ThreadWindowNavigation } from "@/shared/ipc/threadWindow";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { hasAnyClientBridge } from "@/renderer/clientRuntime";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";

const pendingAttachmentImports = new Map<string, Set<Promise<void>>>();

export function trackThreadAttachmentImport(threadId: string, work: Promise<void>): Promise<void> {
  const pending = pendingAttachmentImports.get(threadId) ?? new Set<Promise<void>>();
  pendingAttachmentImports.set(threadId, pending);
  const tracked = work.finally(() => {
    pending.delete(tracked);
    if (pending.size === 0) pendingAttachmentImports.delete(threadId);
  });
  pending.add(tracked);
  return tracked;
}

export function hasPendingThreadAttachmentImports(threadId: string): boolean {
  return pendingAttachmentImports.has(threadId);
}

export async function flushThreadWindowDraft(threadId: string): Promise<void> {
  do {
    const pending = pendingAttachmentImports.get(threadId);
    if (pending) await Promise.all([...pending]);
    await composerDraftStorage()?.flushDraft("thread", threadId);
  } while (pendingAttachmentImports.has(threadId));
}

/** Returns true when this window forwards the action instead of navigating locally. */
export function openInMainWindowFromThread(navigation: ThreadWindowNavigation): boolean {
  if (!hasAnyClientBridge() || readBridge().windowKind !== "thread") return false;
  void readBridge()
    .navigateFromThreadWindow?.(navigation)
    .catch((error: unknown) => toast.danger(friendlyError(error)));
  return true;
}

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
    await flushThreadWindowDraft(thread.id);
    await readBridge().openThreadWindow?.({
      threadId: thread.id,
      title: thread.title,
      ...(thread.remoteServerId ? { remoteServerId: thread.remoteServerId } : {}),
    });
  })().catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** Closes the thread's window; the main window shows the thread once it has closed. */
export function returnThreadToMainWindow(threadId: string): void {
  void flushThreadWindowDraft(threadId)
    .then(() => readBridge().closeThreadWindow?.(threadId))
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** Closes the window of an archived, done or deleted thread and leaves the main window as it is. */
export function dismissThreadWindow(threadId: string): void {
  void readBridge()
    .closeThreadWindow?.(threadId, { returnToMain: false })
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}
