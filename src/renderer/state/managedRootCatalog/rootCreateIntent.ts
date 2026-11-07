/**
 * Central renderer-side row creation intent (B4 F3), for every host.
 *
 * Every renderer-created thread row passes through the store's `createThread`.
 * A new row exists only in this client until an explicit host command
 * persists it; the launch path must therefore know whether the row is a fresh
 * host create+launch (`start`) or an existing row to resume. Recording that
 * intent here — rather than at each producer — is what makes
 * fork/handoff/conflict-resolver producers unable to bypass it.
 *
 * The intent is a client fact, not a runtime decision: it is recorded wherever
 * the row is created and consumed by the launch branch for a row its host
 * owns. A row no host owns never consumes it.
 *
 * Exemptions (all explicit):
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
  readonly worktreeProvisioning?: boolean | undefined;
  readonly suppressHostCreateIntent?: boolean | undefined;
}

/** Called by the thread store after a renderer-created row is installed. */
export function noteRendererCreatedThreadIntent(thread: RendererCreatedThreadIntent): void {
  if (thread.suppressHostCreateIntent === true) return;
  if (runtime?.isHostOriginatedApplication() === true) return;
  // A row created before its host connection is up still records the fact;
  // only the launch branch for a host-owned row consumes it.
  notePendingThreadLaunch(thread.id, thread.worktreeProvisioning === true);
}
import { notePendingThreadLaunch } from "@/renderer/state/threadLaunchIntents";
