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
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { agentEnvForStatus } from "@/shared/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { refreshDiscoveredAgent } from "@/renderer/actions/agentDiscoveryActions";
import type { AgentStatus } from "@/shared/contracts";
import {
  discoveryCardRows,
  groupDiscoveredAgents,
  profileRowLabel,
  type AgentDiscoveryGroup,
} from "./agentDiscoveryGroups";
import { AgentDiscoveryRadar } from "./AgentDiscoveryRadar";
import { AgentDiscoveryDoneButton } from "./AgentDiscoveryDoneButton";
import { prefersReducedMotion, useDiscoveryCardMotion } from "./useDiscoveryCardMotion";
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

function discoveryGridItemClass(index: number, count: number, scanning: boolean): string {
  if (scanning) return "lg:col-span-2";
  const isLast = index === count - 1;
  const isSecondLast = index === count - 2;
  const smCenter =
    count % 2 === 1 && isLast
      ? "sm:max-lg:col-span-2 sm:max-lg:w-[calc(50%-0.3125rem)] sm:max-lg:justify-self-center"
      : "";
  const lgPlacement =
    count % 3 === 1 && isLast
      ? "lg:col-start-3 lg:col-span-2"
      : count % 3 === 2 && isSecondLast
        ? "lg:col-start-2 lg:col-span-2"
        : count % 3 === 2 && isLast
          ? "lg:col-start-4 lg:col-span-2"
          : "lg:col-span-2";
  return smCenter ? `${smCenter} ${lgPlacement}` : lgPlacement;
}

function scrollScrollerToBottom(el: HTMLElement, programmaticUntilRef: { current: number }): void {
  const targetTop = Math.max(0, el.scrollHeight - el.clientHeight);
  if (targetTop <= el.scrollTop + 1) return;
  const reduced = prefersReducedMotion();
  programmaticUntilRef.current = performance.now() + (reduced ? 50 : 500);
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top: targetTop, behavior: reduced ? "auto" : "smooth" });
  } else {
    el.scrollTop = targetTop;
  }
}

function cancelAutoScroll(el: HTMLElement, programmaticUntilRef: { current: number }): void {
  // An instant scroll to the current position interrupts an in-flight smooth
  // follow so the browser cannot continue pulling the viewport after a user
  // grabs or wheels the list.
  programmaticUntilRef.current = 0;
  const top = el.scrollTop;
  if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: "auto" });
  else el.scrollTop = top;
}

export function AgentDiscoveryScreen(props: { onHide: () => void; onCancel: () => void }) {
  const { t } = useLingui();
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const stickToBottomRef = useRef(true);
  const programmaticScrollUntilRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const prevGroupCountRef = useRef(0);
  const prevDiscoveredCountRef = useRef(0);
  const discovered = useAgentStatusesStore((s) => s.discoveredAgents);
  const scanning = useAgentStatusesStore((s) => s.discoveryScanning);
  const scope = useAgentStatusesStore((s) => s.discoveryScope);
  const [pendingRefresh, setPendingRefresh] = useState<ReadonlySet<string>>(new Set());
  // The overlay opens instantly; only a later phase swap (scan finishing)
  // fades the heading and footer copy in.
  const [openedScanning] = useState(scanning);
  const phaseClass = scanning === openedScanning ? "" : "agent-discovery-phase";
  const phaseKey = scanning ? "scanning" : "complete";
  useDiscoveryCardMotion(listRef);
  const { setScrollContainer, scrollEl, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    contentRef: listRef,
    maxFadePx: 28,
  });
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
  // One card per agent, in arrival order. Profiles nest in their base agent's
  // card (they are another account of the same CLI, not another agent);
  // statuses inside a card are ordered deterministically (base agent first,
  // then profiles, native before WSL distros).
  const groups = groupDiscoveredAgents(found);

  const refreshGroup = (group: AgentDiscoveryGroup) => {
    if (pendingRefresh.has(group.kind)) return;
    setPendingRefresh((prev) => new Set(prev).add(group.kind));
    void refreshDiscoveredAgent(group.statuses, group.kind).finally(() =>
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
    (root.querySelector<HTMLButtonElement>("[data-discovery-primary-action]") ?? root).focus({
      preventScroll: true,
    });
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

  // Follow newly arriving cards (and growing detail rows) while the user
  // remains anchored at the bottom; stop immediately if they scroll upward.
  useEffect(() => {
    if (groups.length === 0) {
      stickToBottomRef.current = true;
      prevGroupCountRef.current = 0;
      prevDiscoveredCountRef.current = 0;
      return;
    }
    const grew =
      groups.length > prevGroupCountRef.current ||
      discovered.length > prevDiscoveredCountRef.current;
    prevGroupCountRef.current = groups.length;
    prevDiscoveredCountRef.current = discovered.length;
    if (grew && stickToBottomRef.current && scrollEl) {
      scrollScrollerToBottom(scrollEl, programmaticScrollUntilRef);
    }
  }, [groups.length, discovered.length, scrollEl]);

  useEffect(() => {
    const list = listRef.current;
    if (!scrollEl || !list || typeof ResizeObserver !== "function") return;
    let prevHeight = list.getBoundingClientRect().height;
    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height ?? list.getBoundingClientRect().height;
      const grew = nextHeight > prevHeight + 1;
      prevHeight = nextHeight;
      if (grew && stickToBottomRef.current) {
        scrollScrollerToBottom(scrollEl, programmaticScrollUntilRef);
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [scrollEl]);

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60]"
      tabIndex={-1}
      role="region"
      aria-labelledby={headingId}
    >
      <OverlayShell open instantEnter onExited={props.onHide}>
        {/* The backdrop covers the whole surface, drag strip included, so no
            bare window band shows at the top. Content is a fixed column: the
            hero is pinned on top, only the results grid scrolls, and status
            plus actions stay pinned at the bottom — the logo never shifts as
            agents arrive. */}
        <WelcomeBackdrop className="min-h-0 flex-1" contentClassName="min-h-0 flex-col">
          {/* Bare drag strip — no title bar; the heading below carries the
              name. Keeps the frameless window draggable and clears macOS
              traffic lights, matching the welcome overlay's chrome-free
              surface. */}
          {isBrowserClientRuntime() ? null : (
            <div
              className="agent-discovery-dragstrip shrink-0"
              style={{ height: "env(titlebar-area-height, 32px)" }}
            />
          )}
          <div className="flex shrink-0 flex-col items-center px-6 pt-2 text-center">
            <AgentDiscoveryRadar foundCount={groups.length} scanning={scanning} />
            <h1 id={headingId} className="mt-6 text-2xl font-semibold tracking-tight">
              <span key={phaseKey} className={`inline-block ${phaseClass}`}>
                {scanning ? (
                  <Trans>Discovering coding agents…</Trans>
                ) : (
                  <Trans>Discovery complete</Trans>
                )}
              </span>
            </h1>
            <div
              aria-hidden={!scanning}
              className={`agent-discovery-subtitle ${scanning ? "agent-discovery-subtitle--open" : ""}`}
            >
              <div className="min-h-0 overflow-hidden">
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
              </div>
            </div>
          </div>
          {/* Only this region scrolls; hero and footer stay pinned. */}
          <div
            ref={setScrollContainer}
            style={scrollFadeStyle}
            className="mt-6 min-h-0 flex-1 overflow-y-auto"
            onWheel={(event) => {
              cancelAutoScroll(event.currentTarget, programmaticScrollUntilRef);
              if (event.deltaY < 0) stickToBottomRef.current = false;
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                cancelAutoScroll(event.currentTarget, programmaticScrollUntilRef);
              }
            }}
            onScroll={(event) => {
              const el = event.currentTarget;
              const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
              if (distanceFromBottom <= 24) {
                stickToBottomRef.current = true;
              } else if (
                el.scrollTop < lastScrollTopRef.current - 2 ||
                performance.now() > programmaticScrollUntilRef.current
              ) {
                stickToBottomRef.current = false;
              }
              lastScrollTopRef.current = el.scrollTop;
            }}
          >
            <ul
              ref={listRef}
              aria-hidden={groups.length === 0 || undefined}
              className={
                groups.length > 0
                  ? "relative mx-auto grid w-full max-w-4xl grid-cols-1 items-start gap-2.5 px-6 pt-1 pb-4 text-left sm:grid-cols-2 lg:grid-cols-6"
                  : "hidden"
              }
            >
              {groups.map((group, index) => {
                const rows = discoveryCardRows(group, multiEnv);
                const manifestLabel = labels.get(group.kind);
                const label = manifestLabel ? t(manifestLabel) : rows.header.label;
                const refreshing = pendingRefresh.has(group.kind);
                const hasProfiles = group.statuses.some((status) => status.kind !== group.kind);
                // Secondary rows carry what the header cannot: each machine
                // in a multi-env scan, and each profile (its sign-in state
                // is its own). In a single-env scan the header badge covers
                // the base agent, so only profiles get a row; with no base
                // status found, the profiles are the rows instead.
                const showDetail = rows.detail.length > 0;
                const headerBadge = !multiEnv && rows.base ? foundBadge(rows.base) : undefined;
                return (
                  // Keep columns symmetric while streaming so every card shares
                  // the exact same reveal without overlapping. Once scanning
                  // finishes, any unpaired cards on the last row center
                  // symmetrically under the hero.
                  <li
                    key={group.kind}
                    data-motion-key={group.kind}
                    // Accounts can arrive without changing the agent count.
                    // Announce header badges as well as nested profile rows.
                    aria-live="polite"
                    className={discoveryGridItemClass(index, groups.length, scanning)}
                  >
                    <div className="agent-discovery-row">
                      <div className="flex items-center gap-3">
                        <ProviderIcon
                          kind={group.kind}
                          tone="active"
                          className="size-6 shrink-0"
                          {...(rows.header.icon ? { icon: rows.header.icon } : {})}
                          fallbackLabel={label}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium leading-snug text-foreground">
                            {label}
                          </span>
                          {headerBadge ? (
                            <span
                              className={`agent-discovery-row__status mt-0.5 text-[11.5px] font-medium ${headerBadge.toneClass}`}
                            >
                              <span
                                aria-hidden="true"
                                className="size-1.5 shrink-0 rounded-full bg-current"
                              />
                              {t(headerBadge.label)}
                            </span>
                          ) : null}
                        </div>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label={t`Refresh ${label}`}
                          isDisabled={refreshing}
                          className={`agent-discovery-card__refresh shrink-0 ${
                            refreshing ? "agent-discovery-card__refresh--active" : ""
                          }`}
                          onPress={() => refreshGroup(group)}
                        >
                          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                      {/* Each profile and, in a multi-env scan, each machine
                            with the agent gets a secondary row carrying its
                            own status. */}
                      {showDetail ? (
                        <ul className="mt-2.5 flex flex-col gap-1 border-t border-border/10 pt-2">
                          {rows.detail.map((status) => {
                            const badge = foundBadge(status);
                            const isProfile = status.kind !== group.kind;
                            // Beside profile rows, a bare env label would not
                            // read as the base account — name it. Without
                            // profiles the env alone stays the row label.
                            const namePart = isProfile
                              ? profileRowLabel(status, label)
                              : hasProfiles
                                ? status.label
                                : undefined;
                            const envPart = multiEnv
                              ? localEnvLabel(agentEnvForStatus(status))
                              : undefined;
                            return (
                              <li
                                key={rowKey(status)}
                                className="agent-discovery-env-row flex items-center gap-2 py-0.5"
                              >
                                {namePart ? (
                                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                                    {namePart}
                                  </span>
                                ) : null}
                                {envPart ? (
                                  <span
                                    className={
                                      namePart
                                        ? "min-w-0 shrink truncate text-xs text-muted"
                                        : "min-w-0 flex-1 truncate text-xs text-muted"
                                    }
                                  >
                                    {namePart ? `· ${envPart}` : envPart}
                                  </span>
                                ) : null}
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-4 px-6 pb-6 pt-3">
            <div className="text-xs text-muted" aria-live="polite">
              <span key={phaseKey} className={`flex items-center gap-2 ${phaseClass}`}>
                {scanning ? (
                  <span className="agent-discovery-screen__activity" aria-hidden="true" />
                ) : found.length > 0 ? (
                  <Check className="size-3.5 text-success" aria-hidden="true" />
                ) : null}
                {renderStatusLine(scanning, discovered.length, groups.length, wslDistro)}
              </span>
            </div>
            <div key={phaseKey} className={`flex items-center gap-2 ${phaseClass}`}>
              {scanning ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    data-discovery-primary-action=""
                    onPress={props.onHide}
                  >
                    <EyeOff className="size-3.5" />
                    <Trans>Hide</Trans>
                  </Button>
                  <Button size="sm" variant="tertiary" onPress={props.onCancel}>
                    <X className="size-3.5" />
                    <Trans>Cancel</Trans>
                  </Button>
                </>
              ) : (
                <AgentDiscoveryDoneButton onDone={props.onHide} />
              )}
            </div>
          </div>
        </WelcomeBackdrop>
      </OverlayShell>
    </div>,
    document.body,
  );
}
