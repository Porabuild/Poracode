import { useLingui } from "@lingui/react/macro";
import type { CombinedProviderRuntimeUpdateEntry } from "./useCombinedProviderRuntimeUpdates";

export function CombinedRuntimeVersionList(props: {
  entry: CombinedProviderRuntimeUpdateEntry;
  className?: string;
  updatesOnly?: boolean;
  /**
   * Show `→ v<latest>` for an uninstalled runtime, advertising the version an
   * install would land. Off on surfaces whose action only updates (never
   * installs), so the arrow cannot promise something the button won't do.
   */
  showInstallTarget?: boolean;
}) {
  const { t } = useLingui();
  const runtimes = props.updatesOnly
    ? props.entry.runtimes.filter((runtime) => runtime.updateAvailable)
    : props.entry.runtimes;
  return (
    // Two columns so every runtime label shares one left edge and every
    // version starts at the same x — ragged pairs read as unrelated lines.
    <div
      role="list"
      aria-label={t`Runtime`}
      className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] justify-start gap-x-2.5 gap-y-0.5 ${
        props.className ?? "text-xs"
      }`}
    >
      {runtimes.map((runtime) => (
        <div
          key={runtime.id}
          role="listitem"
          className="col-span-2 grid min-w-0 grid-cols-subgrid items-baseline text-muted"
        >
          <span className="truncate font-medium text-foreground/85">{runtime.label}</span>
          <span className="truncate tabular-nums">
            {runtime.installedVersion ? `v${runtime.installedVersion}` : t`Not installed`}
            {/* An arrow means "you can get this": the upgrade target, or the
                version an install would land. Repeating the current version
                would read as a pending update. */}
            {runtime.latestVersion &&
            (runtime.updateAvailable || (props.showInstallTarget && !runtime.installedVersion))
              ? ` → v${runtime.latestVersion}`
              : null}
          </span>
        </div>
      ))}
    </div>
  );
}
