import { useSyncExternalStore } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { RefreshCw } from "lucide-react";
import { retryManagedParentDescriptor } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  getManagedParentAuthorityState,
  subscribeManagedParentAuthority,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";

/**
 * The managed desktop's own host-owned environments (managed-parent
 * integration). Rendered by Remote Access settings below the pairing content,
 * so it exists whether remote access is advertised or OFF: the co-located
 * server is the authority, and management rides the SAME live loopback client
 * that routes managed procedures — no self-pairing, no synthetic server row,
 * no persisted parent token.
 *
 * Visibility follows the authority surface: a ready authority with the
 * `sshEnvironments` capability renders the shared section; a descriptor
 * failure renders a truthful retry; idle (attached/browser/leg down) renders
 * nothing. Generation keys the mount so a new `(hostDesktopId, endpoint)`
 * identity never reuses another root's cached rows.
 */
export function ManagedHostEnvironmentsSection() {
  const state = useSyncExternalStore(
    subscribeManagedParentAuthority,
    getManagedParentAuthorityState,
  );

  if (state.status === "failed") {
    return (
      <section className="flex flex-col gap-2" aria-busy={state.retrying}>
        <h3 className="text-xs font-semibold text-foreground/80">
          <Trans>Host-owned environments</Trans>
        </h3>
        <p role="alert" className="text-xs text-danger">
          {state.message}
        </p>
        <div>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={state.retrying}
            isPending={state.retrying}
            onPress={() => retryManagedParentDescriptor()}
          >
            <RefreshCw className="size-3.5" />
            <Trans>Retry</Trans>
          </Button>
        </div>
      </section>
    );
  }

  if (state.status !== "ready" || !state.authority.sshEnvironments) return null;

  return (
    <EnvironmentSettingsSection
      key={state.authority.generation}
      parent={{ kind: "managed", hostDesktopId: state.authority.ref.hostDesktopId }}
      parentScopes={state.authority.scopes}
    />
  );
}
