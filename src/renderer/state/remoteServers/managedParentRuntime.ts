/**
 * Managed-parent runtime subscription (managed-parent integration): one owner
 * that keeps persisted managed children aligned with the live loopback parent
 * authority.
 *
 * - On a READY authority for a new identity: dispose stale child sessions of
 *   the previous identity, mark its children offline, then reconnect every
 *   persisted child bound to the new authority (durable children survive a
 *   server restart without re-pairing).
 * - On a generation-preserving rotation republish: nothing changes — child
 *   image subscriptions and sessions stay mounted.
 * - On teardown/failure: children of the retired parent go offline and their
 *   sessions dispose; grants are never deleted and a future root is never
 *   dialed with the old root's grants (the ref keeps them isolated).
 *
 * The store is imported lazily inside the subscription so `bootstrap` can
 * install this module without evaluating the store earlier than today.
 */

import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { disposeEnvironmentSessionsForParent } from "./environmentSessions";
import {
  getManagedParentAuthorityState,
  subscribeManagedParentAuthority,
  type ManagedParentAuthority,
} from "./managedLoopbackOwner";
import {
  environmentParentRef,
  remoteConnectionKey,
  type RemoteServerRecord,
  type RemoteServersState,
} from "./types";

let installed = false;

/** The identity currently reconciled; `null` while no managed parent is live. */
let reconciled: {
  readonly ref: { readonly kind: "managed"; readonly hostDesktopId: string };
} | null = null;

function managedChildrenOf(
  servers: readonly RemoteServerRecord[],
  authority: ManagedParentAuthority,
): RemoteServerRecord[] {
  return servers.filter((server) => {
    if (server.transport?.kind !== "environment") return false;
    const ref = environmentParentRef(server.transport);
    return ref?.kind === "managed" && ref.hostDesktopId === authority.ref.hostDesktopId;
  });
}

function retiredChildrenOf(
  servers: readonly RemoteServerRecord[],
  ref: { readonly kind: "managed"; readonly hostDesktopId: string },
): RemoteServerRecord[] {
  return servers.filter((server) => {
    if (server.transport?.kind !== "environment") return false;
    const parent = environmentParentRef(server.transport);
    return parent?.kind === "managed" && parent.hostDesktopId === ref.hostDesktopId;
  });
}

/**
 * Marks a retired parent's currently live children offline without touching
 * their records or grants. The shared `setRemoteServerFailure` action is not
 * part of the public state surface, so this writes the same runtime shape.
 */
async function reconcileManagedParent(): Promise<void> {
  const { useRemoteServersStore } = await import("@/renderer/state/remoteServersStore");
  const markChildrenOffline = (
    store: {
      readonly runtime: RemoteServersState["runtime"];
      readonly servers: RemoteServerRecord[];
    },
    children: readonly RemoteServerRecord[],
    message: string,
  ): void => {
    const keys = children.map(remoteConnectionKey).filter((key) => {
      const status = store.runtime[key]?.status;
      return status === "online" || status === "connecting";
    });
    if (keys.length === 0) return;
    useRemoteServersStore.setState((state) => {
      const runtime = { ...state.runtime };
      for (const key of keys) {
        const current = state.runtime[key];
        if (!current) continue;
        // Canonical offline shape (same as `setRemoteServerFailure`): spread the
        // current row so agentStatuses and any other runtime fields survive.
        runtime[key] = { ...current, status: "offline", message };
      }
      return { runtime };
    });
  };
  const state = getManagedParentAuthorityState();

  if (state.status !== "ready") {
    const previous = reconciled;
    reconciled = null;
    if (!previous) return;
    // The leg is gone (or its descriptor failed): retire child sessions and
    // surface truthfully offline rows. Grants and records are untouched, so a
    // later authority for this ref reconnects them without re-pairing.
    disposeEnvironmentSessionsForParent(previous.ref);
    const store = useRemoteServersStore.getState();
    markChildrenOffline(
      store,
      retiredChildrenOf(store.servers, previous.ref),
      i18n._(msg`The desktop's own server is not connected.`),
    );
    return;
  }

  const authority = state.authority;
  const sameIdentity =
    reconciled !== null && reconciled.ref.hostDesktopId === authority.ref.hostDesktopId;
  if (sameIdentity) {
    // Rotation / identical republish: generation is stable, keep every child
    // session and mounted image subscriber.
    reconciled = { ref: authority.ref };
    return;
  }

  if (reconciled) {
    const previous = reconciled;
    disposeEnvironmentSessionsForParent(previous.ref);
    const store = useRemoteServersStore.getState();
    markChildrenOffline(
      store,
      retiredChildrenOf(store.servers, previous.ref),
      i18n._(msg`The desktop's own server is not connected.`),
    );
  }
  reconciled = { ref: authority.ref };
  const store = useRemoteServersStore.getState();
  for (const child of managedChildrenOf(store.servers, authority)) {
    void store.reconnectServer(remoteConnectionKey(child)).catch(() => undefined);
  }
}

/** Installs the subscription once per renderer process. */
export function installManagedParentRuntime(): void {
  if (installed) return;
  installed = true;
  subscribeManagedParentAuthority(() => {
    void reconcileManagedParent().catch(() => undefined);
  });
}

/** Test seam. */
export function __resetManagedParentRuntimeForTest(): void {
  installed = false;
  reconciled = null;
}
