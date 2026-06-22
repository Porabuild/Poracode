import { startTransition, useEffect } from "react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, type DragEndEvent, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Tooltip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  formatResetCountdown,
  type UsageSnapshot,
  usageWindowDisplayLabel,
} from "@lightcode/agents-usage";
import { openUsagePanel } from "@/renderer/actions/panelActions";
import { readBridge } from "@/renderer/bridge";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderUsageCircle } from "./ProviderUsageCircle";
import { PaceLine } from "./UsageWindowBars";
import {
  formatWindowPace,
  formatWindowSecondaryValue,
  formatWindowValue,
  sharedWindowResetLabel,
} from "./usageFormat";
import { resolveDisplayedProviders, usesSharedWindowReset } from "./usageProviders";

function statusText(snapshot: UsageSnapshot | undefined): MessageDescriptor | null {
  if (!snapshot) return msg`No data yet`;
  switch (snapshot.status) {
    case "ok":
      return null;
    case "auth-missing":
      return msg`Not signed in`;
    case "app-not-running":
      return msg`Not running`;
    case "rate-limited":
      return msg`Rate limited`;
    case "quota-hit":
      return msg`Quota reached`;
    case "unsupported":
      return msg`Not supported`;
    default:
      return msg`Error`;
  }
}

function UsageTooltipBody(props: {
  id: string;
  label: string;
  snapshot: UsageSnapshot | undefined;
}) {
  const { id, label, snapshot } = props;
  const { t } = useLingui();
  const now = Date.now();
  const message = statusText(snapshot);
  const sharedReset = usesSharedWindowReset(id) ? sharedWindowResetLabel(snapshot, now) : undefined;
  return (
    <div className="min-w-[140px] space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-foreground">{label}</span>
        {snapshot?.plan || sharedReset ? (
          <span className="text-[10px] text-muted">
            {[snapshot?.plan, sharedReset].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
      {snapshot?.status === "ok" && snapshot.windows.length > 0 ? (
        <div className="space-y-0.5">
          {snapshot.windows.map((w) => {
            const reset =
              !usesSharedWindowReset(id) && w.resetsAt !== undefined
                ? formatResetCountdown(w.resetsAt, now)
                : undefined;
            const secondary = formatWindowSecondaryValue(w);
            const pace = formatWindowPace(w, now);
            return (
              <div key={w.id}>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap">
                  <span className="text-muted">{usageWindowDisplayLabel(w)}</span>
                  <span className="font-medium text-foreground">
                    {reset || secondary ? (
                      <span className="mr-1 text-[10px] font-normal text-muted">
                        {[secondary, reset].filter(Boolean).join(" · ")} ·
                      </span>
                    ) : null}
                    {formatWindowValue(w)}
                  </span>
                </div>
                {pace ? <PaceLine pace={pace} className="text-[10px]" /> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-muted">{message ? t(message) : null}</div>
      )}
    </div>
  );
}

function ProviderUsageRailItem(props: { id: string; label: string; index: number; group: string }) {
  const { id, label, index, group } = props;
  const { t } = useLingui();
  const snapshot = useProviderUsage(id);
  const { ref, isDragging } = useSortable({
    id: `${group}:${id}`,
    index,
    type: group,
    accept: [group],
    group,
    data: { id },
  });

  return (
    <div ref={ref} className={isDragging ? "opacity-40" : ""}>
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <button
            type="button"
            aria-label={t`${label} usage — open usage panel`}
            onClick={openUsagePanel}
            className="cursor-grab rounded-full outline-none focus-visible:focus-ring active:cursor-grabbing"
          >
            <ProviderUsageCircle kind={id} windows={snapshot?.windows} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="top" offset={8} className="px-2 py-1.5 text-xs">
          <UsageTooltipBody id={id} label={label} snapshot={snapshot} />
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}

/**
 * A compact rail of per-provider usage rings for the sidebar footer. Hidden when
 * the user turns off `usage.showInSidebar`. On mount it hydrates the store from
 * the supervisor cache (which also triggers a refresh if the cache is stale).
 * Circles are drag-sortable and persist to `usage.providerOrder`, shared with
 * the docked usage panel.
 */
export function ProviderUsageRail(props: { orientation?: "row" | "column" }) {
  const orientation = props.orientation ?? "row";
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const sidebarHiddenProviders = useSharedSettings((s) => s.usage.sidebarHiddenProviders);
  const providerOrder = useSharedSettings((s) => s.usage.providerOrder);
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((res) => {
        if (cancelled) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of res.snapshots) store.mergeSnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // A 5px activation distance lets a plain click open the panel while a drag
  // reorders — mirrors the app's global pointer sensor.
  const sensors = [
    PointerSensor.configure({
      activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
    }),
    KeyboardSensor,
  ];

  // Full set drives the persisted order; the rail only renders the providers
  // whose circle the user hasn't individually hidden. Hidden providers still
  // hold their slot in `providerOrder` (the docked panel can still reorder them).
  const allProviders = resolveDisplayedProviders(providerOrder, disabledProviders, agentInstances);
  const providers = allProviders.filter((p) => !sidebarHiddenProviders.includes(p.id));

  if (!showInSidebar || providers.length === 0) return null;

  // Namespace the sortable group per orientation so the row + column instances
  // (one of which may be mounted but hidden) never share registrations.
  const group = `usage-rail-${orientation}`;

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const src = event.operation.source;
    if (!src || !isSortable(src)) return;
    const fromIndex = src.initialIndex;
    const toIndex = src.index;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    // Reorder only the visible ids, then splice the result back into the full
    // order so hidden providers keep their absolute positions.
    const visibleIds = providers.map((p) => p.id);
    const [moved] = visibleIds.splice(fromIndex, 1);
    if (!moved) return;
    visibleIds.splice(toIndex, 0, moved);
    const hidden = new Set(sidebarHiddenProviders);
    let v = 0;
    const next = allProviders.map((p) => (hidden.has(p.id) ? p.id : visibleIds[v++]!));
    startTransition(() => setUsageSetting("providerOrder", next));
  }

  const items = providers.map((p, index) => (
    <ProviderUsageRailItem key={p.id} id={p.id} label={p.label} index={index} group={group} />
  ));

  // Collapsed icon rail: a centered column of circles.
  if (orientation === "column") {
    return (
      <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex w-full flex-col items-center gap-1.5">{items}</div>
      </DragDropProvider>
    );
  }

  // Expanded sidebar: a labeled "Usage" section that sits between the thread
  // list and the footer nav. The column's gap above and the footer's top border
  // below provide the separation, so no extra dividers here — that avoids the
  // cramped boxed strip. `px-2` aligns the circles with the footer button icons.
  return (
    <div className="px-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
        <Trans>Usage</Trans>
      </p>
      <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-row flex-wrap items-center gap-2.5">{items}</div>
      </DragDropProvider>
    </div>
  );
}
