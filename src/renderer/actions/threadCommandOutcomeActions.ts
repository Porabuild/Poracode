import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { Thread } from "@/shared/contracts";
import {
  REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE,
  RemoteClientError,
  remoteMutationMayHaveCommitted,
} from "@/shared/remote/client";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { isManagedRootDesktopRuntime } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export { REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE };

/**
 * How long the single post-uncertainty authoritative read may take before the
 * action gives up on it. The remote read is actually aborted (the client
 * cancels the HTTP request); the local supervisor read cannot be cancelled, so
 * it is bounded by this deadline on the action's wait. Either way the outcome
 * stays unknown — never a confirmed failure — and no second read is started.
 */
export const REMOTE_COMMAND_RECONCILE_READ_TIMEOUT_MS = 30_000;

/**
 * Truthful classification of a mutation failure that may have committed on the
 * host. The explicit typed 409 is always ambiguous; for every other failure the
 * shared transport rule decides, using the transport's phase evidence: a
 * presend TLS/pin refusal or local validation failure is definite, ordinary
 * defined 4xx rejections are definite, and a dispatched timeout/network drop,
 * HTTP 5xx, or undecodable response is ambiguous. An error the transport never
 * classified (a plain `Error`, or a caller-level response-schema rejection)
 * falls back to the status rule — never "every error is ambiguous".
 *
 * Only mutation call sites may call this; reads carry no commit semantics.
 */
export function isRemoteCommandOutcomeUncertainError(error: unknown): error is RemoteClientError {
  return remoteMutationMayHaveCommitted(error);
}

/**
 * True only when the host authoritatively resolved THIS operation as a
 * definite failure: the crash-safe receipt for the same command id already
 * recorded `failed`, so a retry under that id is refused with
 * `command_failed` and a fresh operation is genuinely new work.
 *
 * A generic 404/403, an absent row, or any locally raised error is NOT this
 * proof: an earlier attempt of the same operation may already have effected
 * something the host could not confirm, so only the recorded per-operation
 * verdict may retire that uncertainty.
 */
export function isRemoteCommandOutcomeAuthoritativelyResolved(
  error: unknown,
): error is RemoteClientError {
  return error instanceof RemoteClientError && error.code === "command_failed";
}

/**
 * Explain an uncertain command outcome. The command was never resent, and one
 * bounded authoritative read already ran (or failed), so the user must check
 * the thread before retrying: the effect may already exist. A manual retry of
 * an ordinary command mints a new command id that the host cannot dedupe
 * against the old one; the managed root's retained create+launch operation is
 * the exception — it keeps its exact id and body until the host authoritatively
 * resolves that operation, so its retry is receipt-replayed or refused, never a
 * second external start.
 */
export function notifyThreadCommandOutcomeUncertain(): void {
  toast.warning(
    i18n._(
      msg`Couldn't confirm this command with the host. It may still have been applied — check the thread before trying again.`,
    ),
  );
}

/**
 * The single bounded authoritative read for a remote thread after an uncertain
 * command, addressed by host identity rather than a local row: a start whose
 * thread id the host never confirmed still has a client-chosen id to read
 * back. One `openRemoteThread` installs the authoritative transcript, thread
 * row, and live item interest. The read is bounded by a real deadline — the
 * client aborts the HTTP request when it elapses — and fenced against a
 * server-identity generation change while it was in flight, so a reconnect or
 * a replaced server can never apply a stale snapshot as authoritative.
 */
export async function reconcileRemoteThreadCommandOutcome(
  desktopId: string,
  remoteId: string,
): Promise<boolean> {
  const generation = currentRemoteServerGeneration(desktopId);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REMOTE_COMMAND_RECONCILE_READ_TIMEOUT_MS);
  try {
    const applied = await useRemoteServersStore.getState().openRemoteThread(desktopId, remoteId, {
      focus: false,
      quiet: true,
      signal: controller.signal,
    });
    if (currentRemoteServerGeneration(desktopId) !== generation) return false;
    return applied;
  } catch {
    return false;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * The single bounded authoritative read after an uncertain command. Runs at
 * most one read and never resends the command.
 *
 * - A projected remote thread re-reads through its host's history snapshot
 *   (see {@link reconcileRemoteThreadCommandOutcome}).
 * - A local thread re-reads the supervisor's runtime snapshots, the local
 *   authority for status, attention, and session ref.
 *
 * Both reads are deadline-bounded; the local IPC read cannot be cancelled, so
 * only the action's wait is bounded. Returns whether an authoritative read
 * applied. A failed, superseded, or timed-out read returns false and
 * deliberately leaves the optimistic state in place: the outcome is still
 * unknown, not a confirmed failure.
 */
export async function reconcileThreadCommandOutcome(thread: Thread): Promise<boolean> {
  const owner = remoteOwner(thread);
  if (owner) return reconcileRemoteThreadCommandOutcome(owner.desktopId, owner.remoteId);
  try {
    const snapshots = await withLocalReadDeadline(readBridge().getThreadSnapshots());
    const store = useAppStore.getState();
    if (!store.threads.some((candidate) => candidate.id === thread.id)) return false;
    store.reconcileRuntimeSnapshots(
      snapshots.filter((snapshot) => snapshot.threadId === thread.id),
      new Set([thread.id]),
      { preserveHostOwnedRootRows: isManagedRootDesktopRuntime() },
    );
    return true;
  } catch {
    return false;
  }
}

/** Deadline bound for the non-cancellable local supervisor read. */
function withLocalReadDeadline<T>(read: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Remote command reconcile read timed out.")),
      REMOTE_COMMAND_RECONCILE_READ_TIMEOUT_MS,
    );
    read.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
