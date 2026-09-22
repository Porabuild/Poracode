import { useEffect, useState, type ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import { isManagedRootDesktopRuntime } from "./rootCatalogCommands";
import { retryManagedRootCatalog } from "./rootCatalogAdapter";
import { getManagedRootCatalogStatus, subscribeManagedRootCatalogStatus } from "./rootCatalogStore";

/**
 * Truthful managed-root startup surface (B4 D2). Preferences-only hydration
 * releases immediately, so the shell paints before the co-located server's
 * catalog arrives; this shows the real state — starting, or failed with the
 * host's message and an explicit retry — instead of an empty sidebar that
 * looks like the user has no projects. `fallback` renders once the catalog is
 * ready (or on every non-managed runtime).
 */
export function ManagedRootCatalogStatusNotice({ fallback }: { readonly fallback?: ReactNode }) {
  const managedRoot = isManagedRootDesktopRuntime();
  const [status, setStatus] = useState(() => getManagedRootCatalogStatus());

  useEffect(() => {
    if (!managedRoot) return;
    return subscribeManagedRootCatalogStatus(() => setStatus(getManagedRootCatalogStatus()));
  }, [managedRoot]);

  if (!managedRoot || status.status === "ready") return <>{fallback}</>;

  if (status.status === "starting") {
    return (
      <p className="text-center text-sm text-muted">
        <Trans>Starting the desktop's own server…</Trans>
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <p className="text-sm text-muted">{status.message}</p>
      <Button
        size="sm"
        variant="secondary"
        isDisabled={status.retrying}
        onPress={retryManagedRootCatalog}
      >
        <Trans>Retry</Trans>
      </Button>
    </div>
  );
}
