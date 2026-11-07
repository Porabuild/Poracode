/**
 * In-flight `openRemoteThread` reads, keyed by the projected (view) thread id.
 *
 * Opening a thread from the sidebar starts one bounded history read, but the
 * restored-pane lifecycle and the pane's own first hydration cannot see that
 * read until it installs (`openThread` is set only afterwards). Without this
 * registry each of them started its own full history read of the same thread,
 * and on a cold host those reads serialize behind each other.
 */
const pendingOpens = new Map<string, Promise<boolean>>();

export function trackPendingRemoteThreadOpen(
  viewThreadId: string,
  open: Promise<boolean>,
): Promise<boolean> {
  pendingOpens.set(viewThreadId, open);
  const release = (): void => {
    if (pendingOpens.get(viewThreadId) === open) pendingOpens.delete(viewThreadId);
  };
  open.then(release, release);
  return open;
}

/** The read currently opening this thread, if any. Resolves `true` once that
 * open installed authoritative history, `false` when it failed or was
 * superseded. */
export function pendingRemoteThreadOpen(viewThreadId: string): Promise<boolean> | undefined {
  return pendingOpens.get(viewThreadId);
}

export function __resetPendingRemoteThreadOpensForTest(): void {
  pendingOpens.clear();
}
