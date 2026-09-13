import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import type { AgentPluginPackage } from "@/shared/contracts";

export function OpenCode2PluginRow({
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
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="break-all text-sm font-medium text-foreground">
          {pkg.target}
          {pkg.version ? (
            <span className="ml-2 font-mono text-[11px] font-normal text-muted">{pkg.version}</span>
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
        </p>
        {!pkg.server && pkg.terminal ? (
          <p className="text-xs text-muted">
            <Trans>Use OpenCode’s CLI to update terminal-only packages.</Trans>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        {pkg.outdated ? (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy}
            isPending={updating}
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
          isDisabled={busy}
          isPending={removing}
          onPress={onRemove}
          aria-label={t`Remove ${pkg.target}`}
        >
          <Trans>Remove</Trans>
        </Button>
      </div>
    </div>
  );
}
export function OpenCode2FeaturedPlugin({
  status,
  disabled,
  pending,
  onInstall,
}: {
  status: AgentPluginPackage["status"] | undefined;
  disabled: boolean;
  pending: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          <Trans>Featured</Trans>
        </p>
        <Button
          size="sm"
          variant="tertiary"
          className="h-7 min-h-7 px-2 text-xs"
          onPress={() => void readBridge().openExternal("https://opencode.ai/docs/ecosystem/")}
        >
          <Trans>Browse ecosystem</Trans>
        </Button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 text-xs">
          <p className="font-medium text-foreground">
            <Trans>OpenCode Goal Plugin</Trans>
          </p>
          <p className="text-muted">
            <Trans>Persistent goals, budgets, and automatic continuation with /goal.</Trans>
          </p>
          <p className="text-muted">
            <Trans>
              Community plugin. V2 support is declared by its author; compatibility depends on your
              OpenCode version.
            </Trans>
          </p>
          <Button
            size="sm"
            variant="tertiary"
            className="h-7 min-h-7 px-2 text-xs"
            onPress={() =>
              void readBridge().openExternal(
                "https://github.com/prevalentWare/opencode-goal-plugin#opencode-2-beta",
              )
            }
          >
            <Trans>Plugin details</Trans>
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={disabled || (status !== undefined && status !== "failed")}
          isPending={pending}
          onPress={onInstall}
        >
          {status === "failed" ? (
            <Trans>Retry</Trans>
          ) : status === "configured" ? (
            <Trans>Configured</Trans>
          ) : status === "active" ? (
            <Trans>Installed</Trans>
          ) : (
            <Trans>Install</Trans>
          )}
        </Button>
      </div>
    </div>
  );
}
