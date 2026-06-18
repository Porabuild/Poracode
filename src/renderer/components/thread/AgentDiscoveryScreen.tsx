import { Button } from "@heroui/react";
import { X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { PixelLoader } from "@/renderer/components/common";
import { getRegisteredProviders, ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import type { CSSProperties, ReactNode } from "react";

function renderStatusLine(
  scopedCount: number,
  installedCount: number,
  wslDistro: string | undefined,
): ReactNode {
  if (scopedCount === 0) {
    return wslDistro ? (
      <Trans>Warming up WSL shell environment…</Trans>
    ) : (
      <Trans>Warming up shell environment…</Trans>
    );
  }
  if (installedCount === 0) return <Trans>No agents installed yet</Trans>;
  return <Plural value={installedCount} one="# agent ready" other="# agents ready" />;
}

function renderCombinedStatusLine(discovered: readonly AgentStatus[]): ReactNode {
  if (discovered.length === 0) return <Trans>Warming up shell environments...</Trans>;
  const readyKinds = new Set(
    discovered.filter((status) => status.installed).map((status) => status.kind),
  );
  if (readyKinds.size === 0) return <Trans>No providers ready yet</Trans>;
  return <Plural value={readyKinds.size} one="# provider ready" other="# providers ready" />;
}

function readyBadge(status: AgentStatus): { label: MessageDescriptor; toneClass: string } | null {
  if (!status.installed) return null;
  if (status.authState === "missing") {
    return { label: msg`Sign in needed`, toneClass: "text-warning" };
  }
  return { label: msg`Ready`, toneClass: "text-success" };
}

function statusRank(status: AgentStatus): number {
  if (!status.installed) return 0;
  return status.authState === "missing" ? 1 : 2;
}

interface ScanTarget {
  key: string;
  label: string;
  matches(status: AgentStatus): boolean;
}

function statusForTarget(
  statuses: readonly AgentStatus[],
  target: ScanTarget | undefined,
): AgentStatus | undefined {
  const matching = target ? statuses.filter((status) => target.matches(status)) : statuses;
  return matching.toSorted((left, right) => statusRank(right) - statusRank(left))[0];
}

function statusLabel(status: AgentStatus | undefined): {
  label: MessageDescriptor;
  toneClass: string;
} {
  if (!status) return { label: msg`Searching...`, toneClass: "text-muted/60" };
  const badge = readyBadge(status);
  if (badge) return badge;
  return { label: msg`Not found`, toneClass: "text-muted/55" };
}

export function AgentDiscoveryScreen(props: {
  location?: ProjectLocation;
  onCancel?: () => void;
  wslDistros?: string[];
}) {
  const { t } = useLingui();
  // `discoveredAgents` is already scoped by `pushDiscoveredAgent` to the active
  // discovery scope, so no additional location filtering is needed here.
  const discovered = useAgentStatusesStore((s) => s.discoveredAgents);
  const discoveryScope = useAgentStatusesStore((s) => s.discoveryScope);
  const byKind = new Map<AgentStatus["kind"], AgentStatus>();
  const statusesByKind = new Map<AgentStatus["kind"], AgentStatus[]>();
  for (const status of discovered) {
    const current = byKind.get(status.kind);
    if (!current || statusRank(status) >= statusRank(current)) {
      byKind.set(status.kind, status);
    }
    statusesByKind.set(status.kind, [...(statusesByKind.get(status.kind) ?? []), status]);
  }
  const installedCount = discovered.reduce((n, s) => n + (s.installed ? 1 : 0), 0);
  const wslDistro = props.location?.kind === "wsl" ? props.location.distro : undefined;
  const scanTargets: ScanTarget[] =
    wslDistro !== undefined
      ? [
          {
            key: `wsl:${wslDistro}`,
            label: `WSL: ${wslDistro}`,
            matches: (status) => status.envKind === "wsl" && status.envDistro === wslDistro,
          },
        ]
      : props.wslDistros !== undefined
        ? [
            {
              key: "native",
              label: t`Windows`,
              matches: (status) => status.envKind !== "wsl",
            },
            ...props.wslDistros.map((distro) => ({
              key: `wsl:${distro}`,
              label: `WSL: ${distro}`,
              matches: (status: AgentStatus) =>
                status.envKind === "wsl" && status.envDistro === distro,
            })),
          ]
        : discoveryScope?.kind === "all"
          ? [
              {
                key: "native",
                label: "Windows",
                matches: (status) => status.envKind !== "wsl",
              },
              ...discoveryScope.wslDistros.map((distro) => ({
                key: `wsl:${distro}`,
                label: `WSL: ${distro}`,
                matches: (status: AgentStatus) =>
                  status.envKind === "wsl" && status.envDistro === distro,
              })),
            ]
          : [];
  // Provider plugins self-register at module-load time; reading the registry
  // each render keeps this screen in sync as new agent kinds are added.
  const providers = getRegisteredProviders();
  const useMatrixLayout = scanTargets.length > 1;
  const statusTargets: ScanTarget[] =
    scanTargets.length > 0
      ? scanTargets
      : [
          {
            key: "system",
            label: t`System`,
            matches: () => true,
          },
        ];
  const matrixGridStyle = {
    "--agent-target-count": statusTargets.length,
  } as CSSProperties;

  return (
    <div className="agent-discovery-screen flex h-full min-h-0 flex-col items-center gap-6 overflow-y-auto px-6 py-6 text-center">
      <div className="flex shrink-0 flex-col items-center gap-3">
        <PixelLoader size="lg" className="text-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">
          <Trans>Discovering coding agents…</Trans>
        </h1>
        <p className="max-w-sm text-sm text-muted">
          {wslDistro
            ? t`Scanning ${wslDistro} for installed CLIs. This usually takes a couple of seconds.`
            : scanTargets.length > 1
              ? t`Scanning Windows and WSL for installed CLIs. This usually takes a couple of seconds.`
              : t`Scanning your system for installed CLIs. This usually takes a couple of seconds.`}
        </p>
        {scanTargets.length > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {scanTargets.map((target) => (
              <span
                key={target.key}
                className="rounded border border-border/70 bg-surface/60 px-2 py-0.5 text-[0.6875rem] font-medium text-muted"
              >
                {target.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex w-full min-h-0 max-w-[42rem] flex-col overflow-hidden rounded border border-border/60 bg-background/25 text-left">
        <div
          className="grid shrink-0 grid-cols-[minmax(11rem,1fr)_repeat(var(--agent-target-count),minmax(7rem,8rem))] border-b border-border/60 px-3 py-2 text-[0.6875rem] font-medium uppercase text-muted/70"
          style={matrixGridStyle}
        >
          <div>
            <Trans>Provider</Trans>
          </div>
          {statusTargets.map((target) => (
            <div key={target.key} className="text-center">
              {/* The per-system label (e.g. "Windows", "WSL: …") only disambiguates
                  when there are multiple environment columns. With a single column —
                  always the case on macOS/Linux — it is redundant noise, so omit it. */}
              {useMatrixLayout ? target.label : null}
            </div>
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
          {providers.map(({ kind, label }) => {
            const statuses = statusesByKind.get(kind) ?? [];
            return (
              <div
                key={kind}
                className="grid min-h-14 grid-cols-[minmax(11rem,1fr)_repeat(var(--agent-target-count),minmax(7rem,8rem))] items-center border-b border-border/40 px-3 py-2 last:border-b-0"
                style={matrixGridStyle}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderIcon kind={kind} className="agent-discovery-item__icon size-7" />
                  <div className="truncate text-sm font-medium">{label}</div>
                </div>
                {statusTargets.map((target) => {
                  const rowStatus = statusForTarget(statuses, target);
                  const labelInfo = statusLabel(rowStatus);
                  return (
                    <div
                      key={target.key}
                      className={`text-center text-xs font-medium ${labelInfo.toneClass}`}
                    >
                      {t(labelInfo.label)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 text-xs text-muted/70" aria-live="polite">
        {useMatrixLayout
          ? renderCombinedStatusLine(discovered)
          : renderStatusLine(discovered.length, installedCount, wslDistro)}
      </div>

      {props.onCancel ? (
        <div className="shrink-0">
          <Button size="sm" variant="tertiary" onPress={props.onCancel}>
            <X className="size-3.5" />
            <Trans>Cancel</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
