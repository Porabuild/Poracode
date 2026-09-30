import { msg } from "@lingui/core/macro";
import type { RemoteThreadCommand, StartThreadResult } from "@/shared/contracts";
import type { RemoteProjectCommand, RemoteProjectCommandResponse } from "@/shared/remote";
import type { StartRemoteNewThreadInput } from "@/shared/remote/client";
import {
  sendClientProjectCommand,
  sendClientThreadCommand,
} from "@/renderer/state/remoteServers/catalog/clientCatalogCommands";
import { friendlyError } from "@/shared/messages";
import { i18n } from "@/renderer/i18n/i18n";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { hasAnyClientBridge, readClientRuntime } from "@/renderer/clientRuntime";
import { isManagedRootRow } from "./rootCatalogRows";
import { managedRootSupportsProjectCommandResults } from "./rootLaunchMetadataCapability";

/**
 * Managed-root intent dispatch (B4 S5/D3).
 *
 * The renderer no longer writes catalog rows. Every user content intent on a
 * root entity is an explicit host command over the ONE managed loopback client
 * (the same client that serves the bounded root catalog read), and the
 * confirmation-gated catalog pass applies host-origin results. Nothing here
 * talks to preload IPC, `dbSyncAll`, or `dbSyncChanges`.
 */

/**
 * True only for the managed Electron desktop (the co-located backend host).
 * Attached Electron and browser/PWA runtimes route their catalog rows through
 * the remote-server path and must never enter the root dispatch.
 */
export function isManagedRootDesktopRuntime(): boolean {
  if (typeof window === "undefined" || !hasAnyClientBridge()) return false;
  try {
    return readClientRuntime().transport === "electron-backend-host";
  } catch {
    return false;
  }
}

/**
 * Root entity ownership marker. A root entity is a resident row with no
 * server projection; the runtime being the managed desktop is what makes it
 * host-owned.
 */
export interface ManagedRootOwner {
  readonly kind: "managed-root";
  readonly threadId: string;
}

export function managedRootOwner(entity: {
  readonly id: string;
  readonly remoteServerId?: string | undefined;
}): ManagedRootOwner | undefined {
  if (!isManagedRootRow(entity)) return undefined;
  if (!isManagedRootDesktopRuntime()) return undefined;
  return { kind: "managed-root", threadId: entity.id };
}

/**
 * Re-entrancy fence for commands the host forwards back to this renderer. A
 * forwarded command mirrors durable host state into local UI state; treating
 * it as a fresh user intent would send the same command back to the host
 * forever.
 */
let hostOriginatedDepth = 0;

export function isApplyingHostOriginatedManagedRootMutation(): boolean {
  return hostOriginatedDepth > 0;
}

export function runHostOriginatedManagedRootMutation<Result>(fn: () => Result): Result {
  hostOriginatedDepth += 1;
  try {
    return fn();
  } finally {
    hostOriginatedDepth -= 1;
  }
}

/**
 * Localized "loopback offline" refusal, shared by intent dispatch and any
 * caller that must refuse a settings read for the same condition.
 */
export function managedRootOfflineError(): Error {
  return new Error(
    i18n._(msg`The desktop's own server is not connected. Your change was not saved.`),
  );
}

/** The live loopback client, or a truthful localized failure. */
function requireManagedRootClient() {
  const activation = readManagedLoopbackActivation();
  if (!activation) throw managedRootOfflineError();
  return activation.client;
}

/**
 * Send one explicit thread intent to the host. A failed command rejects with
 * the transport's error; callers surface it truthfully and never apply the
 * change locally (a local apply would be display-only and is overwritten by
 * the next authoritative page).
 *
 * Narrow catalog mutations (reorder / set-workspace) require the host's
 * crash-safe receipt, so they carry an explicit per-operation command id. Mint
 * one per user action and reuse it only to retry that same action.
 */
export async function sendManagedRootThreadCommand(
  command: RemoteThreadCommand,
  options: { readonly commandId?: string } = {},
): Promise<void> {
  await sendClientThreadCommand(requireManagedRootClient(), command, options);
}

/** Create + launch one root thread host-side, returning the host's result. */
export async function startManagedRootThread(
  input: StartRemoteNewThreadInput,
  options: { readonly commandId?: string } = {},
): Promise<StartThreadResult> {
  const client = requireManagedRootClient();
  const threadId = input.threadId ?? crypto.randomUUID();
  // ONE explicit per-episode command id over the existing SDK launch entry: the
  // host binds the receipt to the principal, the route and the exact body, so
  // an identical retry replays the recorded outcome instead of launching a
  // second runtime, while a re-attempt after a proven pre-effect failure is a
  // new operation with a fresh id. The SDK also carries the complete creation
  // metadata (title/group/worktree/parent/PR/workspace/size) under the host's
  // advertised capability; nothing is re-serialized here.
  return client.startNewThread(
    { ...input, threadId },
    options.commandId !== undefined ? { commandId: options.commandId } : {},
  );
}

/** Project commands (create/clone/remove/rename/relocate/update/…). */
export async function sendManagedRootProjectCommand(
  command: RemoteProjectCommand,
  options: { readonly commandId?: string } = {},
): Promise<RemoteProjectCommandResponse> {
  // The bounded result mode is declared only when the LIVE activation's
  // descriptor advertised `projectCommandResults` v1. The verdict is read
  // before the client handle and fenced to that activation; the call below is
  // synchronous from the verdict, so no activation swap can slip in between
  // and the declaration can never reach a host that did not advertise it.
  const boundedResults = await managedRootSupportsProjectCommandResults();
  return sendClientProjectCommand(requireManagedRootClient(), command, {
    ...options,
    ...(boundedResults ? { result: "bounded" as const } : {}),
  });
}

/** Localized fallback for action catch blocks that only log. */
export function managedRootIntentFailureMessage(error: unknown): string {
  return friendlyError(error) || i18n._(msg`The desktop's own server refused the change.`);
}
