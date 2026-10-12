import { Button } from "@heroui/react";
import { EyeOff, X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OverlayShell } from "@/renderer/components/layout/OverlayShell";
import { OverlayHeader } from "@/renderer/components/layout/OverlayHeader";
import { WelcomeBackdrop } from "@/renderer/components/common/WelcomeBackdrop";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { getProviderManifests } from "@/renderer/components/providers/providerManifest";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import type { AgentStatus } from "@/shared/contracts";
import { AgentDiscoveryRadar } from "./AgentDiscoveryRadar";
import "./agentDiscovery.css";

function renderStatusLine(
  discoveredCount: number,
  foundCount: number,
  wslDistro: string | undefined,
): ReactNode {
  if (discoveredCount === 0) {
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

export function AgentDiscoveryScreen(props: { onHide: () => void; onCancel: () => void }) {
  const { t } = useLingui();
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const discovered = useAgentStatusesStore((s) => s.discoveredAgents);
  const scope = useAgentStatusesStore((s) => s.discoveryScope);
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
  const found = discovered.filter((status) => status.installed);
  const labels = new Map(getProviderManifests().map((manifest) => [manifest.kind, manifest.label]));

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
        <OverlayHeader title={t`Discovering coding agents…`} />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <WelcomeBackdrop className="min-h-full">
            {/* `my-auto` centers the column while it fits and keeps the top
                reachable once the found list overflows the window. */}
            <div className="my-auto flex w-full max-w-md flex-col items-center text-center">
              <AgentDiscoveryRadar foundCount={found.length} />
              <h1 id={headingId} className="mt-6 text-2xl font-semibold tracking-tight">
                <Trans>Discovering coding agents…</Trans>
              </h1>
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
              {found.length > 0 ? (
                <ul className="mt-8 flex w-full max-w-sm flex-col gap-2 text-left">
                  {found.map((status) => {
                    const badge = foundBadge(status);
                    const label = labels.get(status.kind);
                    const name = label ? t(label) : status.label;
                    const envCaption =
                      status.envKind === "wsl" && status.envDistro
                        ? localEnvLabel({ kind: "wsl", distro: status.envDistro })
                        : undefined;
                    return (
                      <li
                        key={`${status.kind}\u0000${status.envKind ?? ""}\u0000${status.envDistro ?? ""}`}
                        className="agent-discovery-row"
                      >
                        <ProviderIcon
                          kind={status.kind}
                          tone="active"
                          className="size-6 shrink-0"
                          {...(status.icon ? { icon: status.icon } : {})}
                          fallbackLabel={name}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium leading-tight">
                            {name}
                          </span>
                          {envCaption ? (
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {envCaption}
                            </span>
                          ) : null}
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
              <div className="mt-6 flex items-center gap-2 text-xs text-muted" aria-live="polite">
                <span className="agent-discovery-screen__activity" aria-hidden="true" />
                {renderStatusLine(discovered.length, found.length, wslDistro)}
              </div>
              <div className="mt-6 flex items-center gap-2">
                <Button size="sm" variant="secondary" onPress={props.onHide}>
                  <EyeOff className="size-3.5" />
                  <Trans>Hide</Trans>
                </Button>
                <Button size="sm" variant="tertiary" onPress={props.onCancel}>
                  <X className="size-3.5" />
                  <Trans>Cancel</Trans>
                </Button>
              </div>
            </div>
          </WelcomeBackdrop>
        </div>
      </OverlayShell>
    </div>,
    document.body,
  );
}
