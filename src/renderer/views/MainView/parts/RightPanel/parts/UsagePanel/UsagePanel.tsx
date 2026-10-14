import { startTransition, useEffect, useRef, useState } from "react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, KeyboardSensor, PointerSensor, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw, Settings2 } from "lucide-react";
import { openUsageSettings } from "@/renderer/actions/panelActions";
import { HostUsageStatus, useHostUsageView } from "@/renderer/components/providers/HostUsageView";
import { HostUsageInfo } from "@/renderer/components/providers/HostUsageInfo";
import { UsageProviderCardView } from "@/renderer/components/providers/UsageProviderCardView";
import { useUsagePanelScope } from "@/renderer/components/providers/useUsagePanelScope";
import { fetchHostUsage } from "@/renderer/components/providers/hostUsage";
import { readBridge } from "@/renderer/bridge";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { RemoteServerPicker } from "@/renderer/components/common/RemoteServerPicker";
import { MobilePageHeaderActions } from "@/renderer/components/layout/MobilePageHeaderActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import {
  usageProvidersForAgentInstances,
  resolveDisplayedProviders,
  separateCurrentUsageProvider,
  usageProviderIdForAgent,
} from "@/renderer/components/providers/usageProviders";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useUsageLoginStateStore } from "@/renderer/state/usageLoginStateStore";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { UsageProviderCard } from "./parts/UsageProviderCard";
import type { TranslateFn } from "@/renderer/i18n/i18n";

const USAGE_SORT_SENSORS = [
  PointerSensor.configure({
    // The compact grip owns `touch-action: none`, so a short movement threshold
    // starts a direct finger drag without interfering with scrolling elsewhere.
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
  KeyboardSensor,
];

/** "Updated 12s ago" style relative label from an epoch-ms timestamp. */
function formatUpdatedAgo(fetchedAt: number, now: number, t: TranslateFn): string {
  const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (seconds < 5) return t(msg`just now`);
  if (seconds < 60) return t(msg`${seconds}s ago`);
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t(msg`${minutes}m ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(msg`${hours}h ago`);
  const days = Math.round(hours / 24);
  return t(msg`${days}d ago`);
}

export function UsagePanel(props: { onOpenUsageSettings?: (() => void) | undefined }) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const providerOrder = useSharedSettings((s) => s.usage.providerOrder);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const collapsedProviders = useSharedSettings((s) => s.usage.collapsedProviders);
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const snapshots = useProviderUsageStore((s) => s.snapshots);
  const requestedDesktopId = useUsageScopeStore((s) => s.desktopId);
  const setRequestedDesktopId = useUsageScopeStore((s) => s.setDesktopId);
  const refreshVersion = useUsageScopeStore((s) => s.refreshVersion);
  const preferredProviderId = useUsageScopeStore((s) => s.preferredProviderId);
  const requestRefresh = useUsageScopeStore((s) => s.requestRefresh);
  const servers = useRemoteServersStore((s) => s.servers);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    contentRef,
    maxFadePx: 10,
  });

  const localProviders = resolveDisplayedProviders(
    providerOrder,
    disabledProviders,
    agentInstances,
  );
  const {
    remote: remoteView,
    effectiveId: effectiveDesktopId,
    remoteSession: browserRuntime,
  } = useUsagePanelScope();

  const hostView = useHostUsageView(
    remoteView ? (effectiveDesktopId ?? "") : "",
    refreshVersion,
    remoteView && compact,
  );
  const localLabels = new Map(
    usageProvidersForAgentInstances(undefined).map((provider) => [provider.id, provider.label]),
  );
  for (const agent of hostView.agents?.windows ?? []) localLabels.set(agent.kind, agent.label);
  const orderedProviders = remoteView
    ? (hostView.canRead ? hostView.usage.snapshots : [])
        .map((snapshot) => ({
          id: snapshot.providerId,
          label: localLabels.get(snapshot.providerId) ?? snapshot.providerId,
        }))
        .sort((a, b) => {
          const rank = (id: string) =>
            providerOrder.indexOf(id) < 0 ? providerOrder.length : providerOrder.indexOf(id);
          return rank(a.id) - rank(b.id);
        })
    : localProviders;
  const { current: currentProvider, rest: sortableProviders } = separateCurrentUsageProvider(
    orderedProviders,
    preferredProviderId
      ? usageProviderIdForAgent(preferredProviderId, undefined, agentInstances)
      : null,
  );
  const displayedSnapshots = remoteView
    ? Object.fromEntries(
        hostView.usage.snapshots.map((snapshot) => [snapshot.providerId, snapshot]),
      )
    : snapshots;

  function renderCard(provider: { id: string; label: string }, index: number, draggable = true) {
    const common = {
      id: provider.id,
      label: provider.label,
      index,
      compact,
      collapsed: collapsedProviders.includes(provider.id),
      draggable,
      onToggleCollapse: toggleCollapse,
    };
    return remoteView ? (
      <UsageProviderCardView
        key={provider.id}
        {...common}
        snapshot={displayedSnapshots[provider.id]}
        showAccount
        refreshing={hostView.usage.refreshing}
        refreshDisabled={!hostView.canRefresh}
        onRefresh={() =>
          void fetchHostUsage(effectiveDesktopId ?? "", true, {
            providerIds: [provider.id],
            force: true,
          })
        }
      />
    ) : (
      <UsageProviderCard key={provider.id} {...common} />
    );
  }

  useEffect(
    () => () => {
      useUsageScopeStore.getState().setPreferredProviderId(null);
    },
    [],
  );

  // Hydrate from the selected machine. Compact pages intentionally request a
  // live refresh whenever they open; docked desktop panels retain the cached
  // read and their explicit refresh action.
  // Alongside it, load the persistent "signed in" flags so the sign-in/out
  // affordance reflects the stored session, not whatever the last fetch returned.
  useEffect(() => {
    if (remoteView) return;
    let cancelled = false;
    const usageRequest = compact
      ? readBridge().refreshProviderUsage({ force: true })
      : refreshVersion > 0
        ? readBridge().refreshProviderUsage({ force: true })
        : readBridge().getProviderUsage({});
    void usageRequest
      .then((res) => {
        if (cancelled) return;
        useProviderUsageStore.getState().setSnapshots(res.snapshots);
      })
      .catch(() => undefined);
    void readBridge()
      .getUsageLoginState({})
      .then((res) => {
        if (!cancelled) useUsageLoginStateStore.getState().setAll(res.stored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [compact, refreshVersion, remoteView]);

  // Keep the single "Updated …" label fresh without re-fetching.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const lastUpdated = (() => {
    let max = 0;
    for (const provider of orderedProviders) {
      const fetchedAt = displayedSnapshots[provider.id]?.fetchedAt;
      if (fetchedAt && fetchedAt > max) max = fetchedAt;
    }
    return max;
  })();

  const openSettings = props.onOpenUsageSettings ?? openUsageSettings;

  const refreshNow = () => {
    if (remoteView ? !hostView.canRefresh || hostView.usage.refreshing : isRefreshing) return;
    setIsRefreshing(true);
    requestRefresh();
    window.setTimeout(() => setIsRefreshing(false), 450);
  };

  const toggleCollapse = (id: string) => {
    const next = collapsedProviders.includes(id)
      ? collapsedProviders.filter((x) => x !== id)
      : [...new Set([...collapsedProviders, id])];
    startTransition(() => setUsageSetting("collapsedProviders", next));
  };

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const src = event.operation.source;
    if (!src || !isSortable(src)) return;
    const fromIndex = src.initialIndex;
    const toIndex = src.index;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const reorderedIds = sortableProviders.map((provider) => provider.id);
    const [moved] = reorderedIds.splice(fromIndex, 1);
    if (!moved) return;
    reorderedIds.splice(toIndex, 0, moved);
    let reorderedIndex = 0;
    const next = orderedProviders.map((provider) =>
      provider.id === currentProvider?.id ? provider.id : reorderedIds[reorderedIndex++]!,
    );
    startTransition(() => setUsageSetting("providerOrder", next));
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      {compact && (lastUpdated > 0 || remoteView) ? (
        <MobilePageHeaderActions>
          {lastUpdated > 0 ? (
            <p className="whitespace-nowrap text-[11px] text-muted/70">
              <Trans>Updated {formatUpdatedAgo(lastUpdated, nowTick, t)}</Trans>
            </p>
          ) : null}
          {remoteView ? <HostUsageInfo className="size-11 min-h-11 min-w-11 text-muted" /> : null}
        </MobilePageHeaderActions>
      ) : null}

      <div
        ref={setScrollContainer}
        className={`m-page-content min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable] ${
          compact
            ? "pb-[calc(var(--m-floating-control-height)+2.5rem+env(safe-area-inset-bottom))]"
            : servers.length > 0
              ? "pb-2"
              : ""
        }`}
        style={scrollFadeStyle}
      >
        <div ref={contentRef} className="min-h-full">
          {remoteView ? <HostUsageStatus view={hostView} className="mb-2" /> : null}
          {orderedProviders.length === 0 ? (
            remoteView ? null : (
              <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-muted">
                  <Trans>No providers are being tracked.</Trans>
                </p>
                <button
                  type="button"
                  onClick={openSettings}
                  className="text-xs text-accent underline-offset-2 hover:underline"
                >
                  <Trans>Enable providers in settings</Trans>
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {currentProvider ? (
                <section aria-label={t`Current`} className="flex flex-col gap-1.5">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                    <Trans>Current</Trans>
                  </p>
                  {renderCard(currentProvider, 0, false)}
                </section>
              ) : null}
              {sortableProviders.length > 0 ? (
                <DragDropProvider sensors={USAGE_SORT_SENSORS} onDragEnd={handleDragEnd}>
                  <div className="flex flex-col gap-2">
                    {sortableProviders.map((provider, index) => renderCard(provider, index))}
                  </div>
                </DragDropProvider>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {!compact ? (
        <div className="m-page-content flex shrink-0 flex-col items-center gap-1.5 px-3 py-2">
          {servers.length > 0 || (!browserRuntime && requestedDesktopId !== null) ? (
            <RemoteServerPicker
              value={effectiveDesktopId}
              includeLocal={!browserRuntime}
              onChange={setRequestedDesktopId}
              buttonClassName="h-7 min-h-7 max-w-[12rem] gap-1 rounded-full border border-[color:var(--border)] bg-[var(--content-background)] px-2.5 shadow-sm"
              opensUpward
            />
          ) : null}
          {lastUpdated > 0 ? (
            <p className="text-[11px] text-muted/70">
              <Trans>Updated {formatUpdatedAgo(lastUpdated, nowTick, t)}</Trans>
            </p>
          ) : null}
        </div>
      ) : null}

      {compact ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 grid grid-cols-[var(--m-floating-control-height)_minmax(0,1fr)_var(--m-floating-control-height)] items-center gap-[var(--m-floating-control-gap)] px-[var(--m-page-inline)]">
          <MobileCircleButton
            className="pointer-events-auto"
            aria-label={t`Usage settings`}
            onPress={openSettings}
          >
            <Settings2 className="size-4" />
          </MobileCircleButton>
          <RemoteServerPicker
            value={effectiveDesktopId}
            includeLocal={!browserRuntime}
            onChange={setRequestedDesktopId}
            buttonClassName="m-floating-selector pointer-events-auto w-full px-4 text-sm"
            opensUpward
          />
          <MobileCircleButton
            className="pointer-events-auto"
            aria-label={t`Refresh`}
            isDisabled={
              remoteView ? !hostView.canRefresh || hostView.usage.refreshing : isRefreshing
            }
            onPress={refreshNow}
          >
            <RefreshCw
              className={`size-4 ${(remoteView ? hostView.usage.refreshing : isRefreshing) ? "animate-spin" : ""}`}
            />
          </MobileCircleButton>
        </div>
      ) : null}
    </div>
  );
}
