import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import type { AgentPluginPackage } from "@/shared/contracts";

/** Installed versions can be commit hashes; show those the way OpenCode does. */
export function displayPluginVersion(version: string): string {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(version) ? version.slice(0, 7) : `v${version}`;
}

export function OpenCodePluginRow({
  pkg,
  busy,
  updating,
  removing,
  onUpdate,
  onRemove,
}: {
  pkg: AgentPluginPackage;
  /** Any plugin operation is in flight; the CLI serializes them per environment. */
  busy: boolean;
  updating: boolean;
  removing: boolean;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const isUpdating = updating || pkg.updating === true;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="break-all text-sm font-medium text-foreground">
          {pkg.target}
          {pkg.version || pkg.latestVersion ? (
            <span className="ml-2 font-mono text-[11px] font-normal text-muted">
              {pkg.version ? displayPluginVersion(pkg.version) : ""}
              {pkg.latestVersion
                ? `${pkg.version ? " → " : ""}${displayPluginVersion(pkg.latestVersion)}`
                : ""}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted">
          {pkg.status === "failed" ? (
            <span className="text-danger">
              <Trans>Failed to load</Trans>
            </span>
          ) : pkg.status === "configured" ? (
            <Trans>Configured</Trans>
          ) : (
            <Trans>Installed</Trans>
          )}
          {pkg.server ? (
            <>
              {" "}
              · <Trans>Agent</Trans>
            </>
          ) : null}
          {pkg.terminal ? (
            <>
              {" "}
              · <Trans>Terminal</Trans>
            </>
          ) : null}
          {pkg.outdated && !isUpdating ? (
            <>
              {" "}
              · <Trans>Update available</Trans>
            </>
          ) : null}
        </p>
        {!pkg.server && pkg.terminal ? (
          <p className="text-xs text-muted">
            <Trans>Use OpenCode’s CLI to update terminal-only packages.</Trans>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isUpdating ? (
          <span role="status" className="flex items-center gap-1.5 px-2 text-xs text-muted">
            <PixelLoader size="xs" />
            {pkg.latestVersion ? (
              <Trans>Updating to v{pkg.latestVersion}</Trans>
            ) : (
              <Trans>Updating</Trans>
            )}
          </span>
        ) : pkg.outdated ? (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onPress={onUpdate}
            aria-label={t`Update ${pkg.target}`}
          >
            <Trans>Update</Trans>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="tertiary"
          className="text-danger"
          isDisabled={busy || isUpdating}
          isPending={removing}
          onPress={onRemove}
          aria-label={t`Remove ${pkg.target}`}
        >
          {removing ? <PixelLoader size="xs" /> : null}
          <Trans>Remove</Trans>
        </Button>
      </div>
    </div>
  );
}
