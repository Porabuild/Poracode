import { startTransition, useEffect, useRef, useState } from "react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, KeyboardSensor, PointerSensor, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw, Settings2 } from "lucide-react";
import { openUsageSettings } from "@/renderer/actions/panelActions";
import { readBridge } from "@/renderer/bridge";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { RemoteServerPicker } from "@/renderer/components/common/RemoteServerPicker";
import { MobilePageHeaderActions } from "@/renderer/components/layout/MobilePageHeaderActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import {
  resolveDisplayedProviders,
  separateCurrentUsageProvider,
} from "@/renderer/components/providers/usageProviders";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import {
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
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
  const defaultBrowserServer = useRemoteServersStore(selectBrowserBridgeServer);
  const withClient = useRemoteServersStore((s) => s.withClient);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    contentRef,
    maxFadePx: 10,
  });

  const orderedProviders = resolveDisplayedProviders(
    providerOrder,
    disabledProviders,
    agentInstances,
  );
  const { current: currentProvider, rest: sortableProviders } = separateCurrentUsageProvider(
    orderedProviders,
    preferredProviderId,
  );

  const browserRuntime = isBrowserClientRuntime();
  const browserServer = defaultBrowserServer ?? servers[0];
  const requestedServer = servers.find((server) => server.desktopId === requestedDesktopId);
  const scopedServer = requestedServer ?? (browserRuntime ? browserServer : undefined);
  const effectiveDesktopId =
    requestedServer?.desktopId ?? (browserRuntime ? (browserServer?.desktopId ?? null) : null);

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
    let cancelled = false;
    const usageRequest = scopedServer
      ? withClient(scopedServer.desktopId, (client) => client.providerUsage())
      : compact
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
    if (!scopedServer) {
      void readBridge()
        .getUsageLoginState({})
        .then((res) => {
          if (!cancelled) useUsageLoginStateStore.getState().setAll(res.stored);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [compact, refreshVersion, scopedServer, withClient]);

  // Keep the single "Updated …" label fresh without re-fetching.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const lastUpdated = (() => {
    let max = 0;
    for (const provider of orderedProviders) {
      const fetchedAt = snapshots[provider.id]?.fetchedAt;
      if (fetchedAt && fetchedAt > max) max = fetchedAt;
    }
    return max;
  })();

  const openSettings = props.onOpenUsageSettings ?? openUsageSettings;

  const refreshNow = () => {
    if (isRefreshing) return;
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
      {compact && lastUpdated > 0 ? (
        <MobilePageHeaderActions>
          <p className="whitespace-nowrap text-[11px] text-muted/70">
            <Trans>Updated {formatUpdatedAgo(lastUpdated, nowTick, t)}</Trans>
          </p>
        </MobilePageHeaderActions>
      ) : null}

      <div
        ref={setScrollContainer}
        className={`m-page-content min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable] ${
          compact
            ? "pb-[calc(var(--m-floating-control-height)+2.5rem+env(safe-area-inset-bottom))]"
            : ""
        }`}
        style={scrollFadeStyle}
      >
        <div ref={contentRef} className="min-h-full">
          {orderedProviders.length === 0 ? (
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
          ) : (
            <div className="flex flex-col gap-3.5">
              {currentProvider ? (
                <section aria-label={t`Current`} className="flex flex-col gap-1.5">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                    <Trans>Current</Trans>
                  </p>
                  <UsageProviderCard
                    id={currentProvider.id}
                    label={currentProvider.label}
                    index={0}
                    compact={compact}
                    collapsed={collapsedProviders.includes(currentProvider.id)}
                    draggable={false}
                    onToggleCollapse={toggleCollapse}
                  />
                </section>
              ) : null}
              {sortableProviders.length > 0 ? (
                <DragDropProvider sensors={USAGE_SORT_SENSORS} onDragEnd={handleDragEnd}>
                  <div className="flex flex-col gap-2.5">
                    {sortableProviders.map((provider, index) => (
                      <UsageProviderCard
                        key={provider.id}
                        id={provider.id}
                        label={provider.label}
                        index={index}
                        compact={compact}
                        collapsed={collapsedProviders.includes(provider.id)}
                        onToggleCollapse={toggleCollapse}
                      />
                    ))}
                  </div>
                </DragDropProvider>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {!compact && lastUpdated > 0 ? (
        <div className="m-page-content shrink-0 px-3 py-1.5">
          <p className="text-[11px] text-muted/70">
            <Trans>Updated {formatUpdatedAgo(lastUpdated, nowTick, t)}</Trans>
          </p>
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
            isDisabled={isRefreshing}
            onPress={refreshNow}
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </MobileCircleButton>
        </div>
      ) : null}
    </div>
  );
}
