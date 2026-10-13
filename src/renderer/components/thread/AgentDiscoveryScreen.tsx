import { Button } from "@heroui/react";
import { Check, EyeOff, RefreshCw, X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OverlayShell } from "@/renderer/components/layout/OverlayShell";
import { WelcomeBackdrop } from "@/renderer/components/common/WelcomeBackdrop";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { getProviderManifests } from "@/renderer/components/providers/providerManifest";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { agentEnvForStatus, type AgentEnv } from "@/shared/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { refreshDiscoveredAgent } from "@/renderer/actions/agentDiscoveryActions";
import type { AgentStatus } from "@/shared/contracts";
import { AgentDiscoveryRadar } from "./AgentDiscoveryRadar";
import "./agentDiscovery.css";

/** Collision-free row key for (kind, env) without embedding separators. */
function rowKey(status: AgentStatus): string {
  return JSON.stringify([status.kind, status.envKind ?? null, status.envDistro ?? null]);
}

function renderStatusLine(
  scanning: boolean,
  discoveredCount: number,
  foundCount: number,
  wslDistro: string | undefined,
): ReactNode {
  if (scanning && discoveredCount === 0) {
    return wslDistro ? (
      <Trans>Warming up WSL shell environment…</Trans>
    ) : (
      <Trans>Warming up shell environment…</Trans>
    );
  }
  if (foundCount === 0) return <Trans>No agents installed yet</Trans>;
  return <Plural value={foundCount} one="# agent found" other="# agents found" />;
}

function foundBadge(status: AgentStatus): { label: MessageDescriptor; toneClass: string } {
  if (status.authState === "missing")
    return { label: msg`Sign in needed`, toneClass: "text-warning" };
  const usable = status.installed && status.capabilities.models.length > 0;
  return usable
    ? { label: msg`Ready`, toneClass: "text-success" }
    : { label: msg`Found`, toneClass: "text-warning" };
}

/** One card per agent kind; each machine it was found on is a sub-row. */
interface AgentGroup {
  kind: string;
  statuses: AgentStatus[];
}

/** Native install first, then WSL distros alphabetically. */
function compareEnvs(a: AgentEnv, b: AgentEnv): number {
  if (a.kind !== b.kind) return a.kind === "native" ? -1 : 1;
  return a.kind === "wsl" && b.kind === "wsl" ? a.distro.localeCompare(b.distro) : 0;
}

export function AgentDiscoveryScreen(props: { onHide: () => void; onCancel: () => void }) {
  const { t } = useLingui();
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const discovered = useAgentStatusesStore((s) => s.discoveredAgents);
  const scanning = useAgentStatusesStore((s) => s.discoveryScanning);
  const scope = useAgentStatusesStore((s) => s.discoveryScope);
  const [pendingRefresh, setPendingRefresh] = useState<ReadonlySet<string>>(new Set());
  const wslDistro = scope?.kind === "wsl" ? scope.distro : undefined;
  const wslDistros = scope?.kind === "all" ? scope.wslDistros : [];
  const scanLabels = wslDistro
    ? []
    : wslDistros.length > 0
      ? [
          localEnvLabel({ kind: "native" }),
          ...wslDistros.map((distro) => localEnvLabel({ kind: "wsl", distro })),
        ]
      : [];
  // Only a scan spanning several environments labels each row's machine —
  // repeating the one env under every row of a single-env scan is noise.
  const multiEnv = scope?.kind === "all" && scope.wslDistros.length > 0;
  const found = discovered.filter((status) => status.installed);
  const labels = new Map(getProviderManifests().map((manifest) => [manifest.kind, manifest.label]));
  // One card per agent kind, in arrival order; machines inside a card are
  // ordered deterministically (native first, then distros alphabetically).
  const groups: AgentGroup[] = [];
  const groupsByKind = new Map<string, AgentStatus[]>();
  for (const status of found) {
    const existing = groupsByKind.get(status.kind);
    if (existing) {
      existing.push(status);
    } else {
      const statuses = [status];
      groupsByKind.set(status.kind, statuses);
      groups.push({ kind: status.kind, statuses });
    }
  }
  for (const group of groups) {
    group.statuses.sort((a, b) => compareEnvs(agentEnvForStatus(a), agentEnvForStatus(b)));
  }

  const refreshGroup = (group: AgentGroup) => {
    if (pendingRefresh.has(group.kind)) return;
    setPendingRefresh((prev) => new Set(prev).add(group.kind));
    void refreshDiscoveredAgent(group.statuses).finally(() =>
      setPendingRefresh((prev) => {
        if (!prev.has(group.kind)) return prev;
        const next = new Set(prev);
        next.delete(group.kind);
        return next;
      }),
    );
  };

  // This full-window surface has two actions. Keep the covered app inert and
  // restore its previous focus when the shared OverlayShell exits.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const previous = document.activeElement;
    const siblings = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== root,
    );
    const previousInert = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    const controls = () => [...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    (controls()[0] ?? root).focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = controls();
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      (
        buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length] ?? root
      ).focus();
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      siblings.forEach((el, index) => {
        el.inert = previousInert[index] ?? false;
      });
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
      if (document.activeElement === document.body)
        document
          .querySelector<HTMLButtonElement>("[data-agent-discovery-indicator] button")
          ?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60]"
      tabIndex={-1}
      role="region"
      aria-labelledby={headingId}
    >
      <OverlayShell open instantEnter onExited={props.onHide}>
        {/* Bare drag strip — no title bar; the heading below carries the name.
            Keeps the frameless window draggable and clears macOS traffic
            lights, matching the welcome overlay's chrome-free surface. */}
        {isBrowserClientRuntime() ? null : (
          <div
            className="agent-discovery-dragstrip relative z-10 shrink-0"
            style={{ height: "env(titlebar-area-height, 32px)" }}
          />
        )}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <WelcomeBackdrop className="min-h-full">
            {/* `my-auto` centers the column while it fits and keeps the top
                reachable once the found list overflows the window. The column
                stays narrow while scanning and widens for the results grid so
                agent cards use the side space instead of one long list. */}
            <div
              className={`my-auto flex w-full flex-col items-center text-center ${
                found.length > 0 ? "max-w-3xl" : "max-w-md"
              }`}
            >
              <AgentDiscoveryRadar foundCount={found.length} scanning={scanning} />
              <h1 id={headingId} className="mt-6 text-2xl font-semibold tracking-tight">
                {scanning ? (
                  <Trans>Discovering coding agents…</Trans>
                ) : (
                  <Trans>Discovery complete</Trans>
                )}
              </h1>
              {scanning ? (
                <>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                    {wslDistro
                      ? t`Scanning ${wslDistro} for installed CLIs. This usually takes a couple of seconds.`
                      : scanLabels.length > 1
                        ? t`Scanning Windows and WSL for installed CLIs. This usually takes a couple of seconds.`
                        : t`Scanning your system for installed CLIs. This usually takes a couple of seconds.`}
                  </p>
                  {scanLabels.length > 0 ? (
                    <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-muted">
                      {scanLabels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
              {groups.length > 0 ? (
                <ul className="mt-8 grid w-full grid-cols-1 items-start gap-2 text-left sm:grid-cols-2">
                  {groups.map((group) => {
                    const first = group.statuses[0]!;
                    const manifestLabel = labels.get(group.kind);
                    const label = manifestLabel ? t(manifestLabel) : first.label;
                    const refreshing = pendingRefresh.has(group.kind);
                    return (
                      <li key={group.kind} className="agent-discovery-row">
                        <div className="flex items-center gap-3">
                          <ProviderIcon
                            kind={group.kind}
                            tone="active"
                            className="size-6 shrink-0"
                            {...(first.icon ? { icon: first.icon } : {})}
                            fallbackLabel={label}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                            {label}
                          </span>
                          {multiEnv ? null : (
                            <span
                              className={`agent-discovery-row__status shrink-0 text-xs font-medium ${foundBadge(first).toneClass}`}
                            >
                              <span
                                aria-hidden="true"
                                className="size-1.5 shrink-0 rounded-full bg-current"
                              />
                              {t(foundBadge(first).label)}
                            </span>
                          )}
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={t`Refresh ${label}`}
                            isDisabled={refreshing}
                            onPress={() => refreshGroup(group)}
                          >
                            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                        {/* In a multi-env scan each machine with the agent gets
                            a secondary row carrying that machine's status. */}
                        {multiEnv ? (
                          <ul className="mt-2 flex flex-col gap-0.5 border-t border-border/10 pt-2">
                            {group.statuses.map((status) => {
                              const badge = foundBadge(status);
                              return (
                                <li
                                  key={rowKey(status)}
                                  className="agent-discovery-env-row flex items-center gap-2 py-0.5 pl-9"
                                >
                                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                                    {localEnvLabel(agentEnvForStatus(status))}
                                  </span>
                                  <span
                                    className={`agent-discovery-row__status shrink-0 text-xs font-medium ${badge.toneClass}`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className="size-1.5 shrink-0 rounded-full bg-current"
                                    />
                                    {t(badge.label)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="mt-6 flex items-center gap-2 text-xs text-muted" aria-live="polite">
                {scanning ? (
                  <span className="agent-discovery-screen__activity" aria-hidden="true" />
                ) : found.length > 0 ? (
                  <Check className="size-3.5 text-success" aria-hidden="true" />
                ) : null}
                {renderStatusLine(scanning, discovered.length, groups.length, wslDistro)}
              </div>
              <div className="mt-6 flex items-center gap-2">
                {scanning ? (
                  <>
                    <Button size="sm" variant="secondary" onPress={props.onHide}>
                      <EyeOff className="size-3.5" />
                      <Trans>Hide</Trans>
                    </Button>
                    <Button size="sm" variant="tertiary" onPress={props.onCancel}>
                      <X className="size-3.5" />
                      <Trans>Cancel</Trans>
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" onPress={props.onHide}>
                    <Check className="size-3.5" />
                    <Trans>Done</Trans>
                  </Button>
                )}
              </div>
            </div>
          </WelcomeBackdrop>
        </div>
      </OverlayShell>
    </div>,
    document.body,
  );
}
