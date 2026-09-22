import { notePendingManagedRootLaunch } from "./rootCatalogStore";

/**
 * Central renderer-side root-row creation intent (B4 F3).
 *
 * Every renderer-created thread row passes through the store's `createThread`.
 * An unprojected row exists only in the renderer until an explicit host
 * command persists it; the launch path must therefore know whether the row is
 * a fresh host create+launch (`start`) or an existing row to resume
 * (supervisor IPC). Recording that intent here — rather than at each producer
 * — is what makes fork/handoff/conflict-resolver producers unable to bypass it.
 *
 * The intent is a renderer fact, not a runtime decision: it is recorded
 * wherever the row is created and consumed only by the managed-root launch
 * branch (which is itself gated on the managed desktop runtime). On any other
 * runtime it is inert.
 *
 * Exemptions (all explicit):
 * - projected remote rows (they launch on their own host);
 * - host-origin application (a forwarded `start`/projection mirror: the host
 *   already owns the durable row, so a marker would re-create/relaunch it);
 * - rows whose producer declares `suppressHostCreateIntent` (experiment
 *   candidates, whose durability is a separate pending host intent).
 */
export interface RootCreateIntentRuntime {
  readonly isHostOriginatedApplication: () => boolean;
}

let runtime: RootCreateIntentRuntime | null = null;

export function configureRootCreateIntentRuntime(next: RootCreateIntentRuntime | null): void {
  runtime = next;
}

export interface RendererCreatedThreadIntent {
  readonly id: string;
  readonly remoteServerId?: string | undefined;
  readonly worktreeProvisioning?: boolean | undefined;
  readonly suppressHostCreateIntent?: boolean | undefined;
}

/** Called by the thread store after a renderer-created row is installed. */
export function noteRendererCreatedThreadIntent(thread: RendererCreatedThreadIntent): void {
  if (thread.suppressHostCreateIntent === true) return;
  if (thread.remoteServerId !== undefined) return;
  if (runtime?.isHostOriginatedApplication() === true) return;
  // A row created before the managed adapter is installed (or on another
  // runtime) still records the fact; only the managed launch branch ever
  // consumes it.
  notePendingManagedRootLaunch(thread.id, thread.worktreeProvisioning === true);
}
