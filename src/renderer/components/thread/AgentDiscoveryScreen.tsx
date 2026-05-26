import { Button } from "@heroui/react";
import { X } from "lucide-react";
import { PixelLoader } from "@/renderer/components/common";
import { getRegisteredProviders, ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import type { CSSProperties } from "react";

function readyBadge(status: AgentStatus): { label: string; toneClass: string } | null {
  if (!status.installed) return null;
  if (status.authState === "missing") {
    return { label: "Sign in needed", toneClass: "text-warning" };
  }
  return { label: "Ready", toneClass: "text-success" };
}

function statusLine(scopedCount: number, installedCount: number, wslDistro: string | undefined) {
  if (scopedCount === 0) {
    return wslDistro ? "Warming up WSL shell environment…" : "Warming up shell environment…";
  }
  if (installedCount === 0) return "No agents installed yet";
  if (installedCount === 1) return "1 agent ready";
  return `${installedCount} agents ready`;
}

function combinedStatusLine(discovered: readonly AgentStatus[]): string {
  if (discovered.length === 0) return "Warming up shell environments...";
  const readyKinds = new Set(
    discovered.filter((status) => status.installed).map((status) => status.kind),
  );
  if (readyKinds.size === 0) return "No providers ready yet";
  if (readyKinds.size === 1) return "1 provider ready";
  return `${readyKinds.size} providers ready`;
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

function statusLabel(status: AgentStatus | undefined): { label: string; toneClass: string } {
  if (!status) return { label: "Searching...", toneClass: "text-muted/60" };
  const badge = readyBadge(status);
  if (badge) return badge;
  return { label: "Not found", toneClass: "text-muted/55" };
}

export function AgentDiscoveryScreen(props: {
  location?: ProjectLocation;
  onCancel?: () => void;
  wslDistros?: string[];
}) {
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
              label: "Windows",
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
            label: "System",
            matches: () => true,
          },
        ];
  const matrixGridStyle = {
    "--agent-target-count": statusTargets.length,
  } as CSSProperties;

  return (
    <div className="agent-discovery-screen flex h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <PixelLoader size="lg" className="text-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">Discovering coding agents…</h1>
        <p className="max-w-sm text-sm text-muted">
          {wslDistro
            ? `Scanning ${wslDistro} for installed CLIs. This usually takes a couple of seconds.`
            : scanTargets.length > 1
              ? "Scanning Windows and WSL for installed CLIs. This usually takes a couple of seconds."
              : "Scanning your system for installed CLIs. This usually takes a couple of seconds."}
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

      <div className="w-full max-w-[42rem] overflow-hidden rounded border border-border/60 bg-background/25 text-left">
        <div
          className="grid grid-cols-[minmax(11rem,1fr)_repeat(var(--agent-target-count),minmax(7rem,8rem))] border-b border-border/60 px-3 py-2 text-[0.6875rem] font-medium uppercase text-muted/70"
          style={matrixGridStyle}
        >
          <div>Provider</div>
          {statusTargets.map((target) => (
            <div key={target.key} className="text-center">
              {target.label}
            </div>
          ))}
        </div>
        <div>
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
                      {labelInfo.label}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-muted/70" aria-live="polite">
        {useMatrixLayout
          ? combinedStatusLine(discovered)
          : statusLine(discovered.length, installedCount, wslDistro)}
      </div>

      {props.onCancel ? (
        <Button size="sm" variant="tertiary" onPress={props.onCancel}>
          <X className="size-3.5" />
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
