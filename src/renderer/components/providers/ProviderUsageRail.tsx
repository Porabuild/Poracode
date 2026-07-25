import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, type DragEndEvent, KeyboardSensor, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Tooltip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Check } from "lucide-react";
import { formatResetCountdown, usageWindowDisplayLabel } from "@poracode/agents-usage/formatters";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { openUsagePanel } from "@/renderer/actions/panelActions";
import { readBridge } from "@/renderer/bridge";
import { ContextMenu, type ContextMenuEntry } from "@/renderer/components/common/ContextMenu";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderUsageCircle } from "./ProviderUsageCircle";
import { UsageOverflowChip } from "./UsageOverflowChip";
import { PaceLine } from "./UsageWindowBars";
import {
  formatWindowPace,
  formatWindowSecondaryValue,
  formatWindowValue,
  sharedWindowResetLabel,
} from "./usageFormat";
import {
  hasRailUsage,
  isClaudeUsageProvider,
  resolveDisplayedProviders,
  usageRingGroups,
  usesSharedWindowReset,
  type UsageProvider,
} from "./usageProviders";
import {
  fitUsageRail,
  RAIL_CIRCLE_SIZE,
  RAIL_COLUMN_GAP,
  RAIL_COLUMN_MAX,
  RAIL_ROW_GAP,
  railSlots,
} from "./usageRailFit";

// A 5px activation distance lets a plain click open the panel while a drag
// reorders — mirrors the app's global pointer sensor. `configure` returns a
// plugin descriptor, not a live sensor, so one module-level array is safe to
// share and keeps a stable identity across renders.
const RAIL_SENSORS = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
  KeyboardSensor,
];

const STRIP = {
  row: { className: "flex flex-row items-center overflow-hidden", gap: RAIL_ROW_GAP },
  column: {
    className: "mb-1 flex w-full flex-col items-center border-b border-[var(--hairline)] pb-2",
    gap: RAIL_COLUMN_GAP,
  },
} as const;

function statusText(
  providerId: string,
  snapshot: UsageSnapshot | undefined,
): MessageDescriptor | null {
  if (!snapshot) return msg`No data yet`;
  switch (snapshot.status) {
    case "ok":
      return null;
    case "auth-missing":
      if (isClaudeUsageProvider(providerId)) return msg`No data yet`;
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
  swappable?: boolean;
}) {
  const { id, label, snapshot, swappable } = props;
  const { t } = useLingui();
  const now = Date.now();
  const message = statusText(id, snapshot);
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
      {swappable ? (
        <div className="pt-0.5 text-[10px] text-muted/70">
          <Trans>Right-click to switch ring</Trans>
        </div>
      ) : null}
    </div>
  );
}

function ProviderUsageRailItem(props: { id: string; label: string; index: number; group: string }) {
  const { id, label, index, group } = props;
  const { t } = useLingui();
  const snapshot = useProviderUsage(id);
  const selectedRingGroups = useSharedSettings((s) => s.usage.selectedRingGroups);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const { ref, isDragging } = useSortable({
    id: `${group}:${id}`,
    index,
    type: group,
    accept: [group],
    group,
    data: { id },
  });

  // Providers with more than one selectable ring group (e.g. Antigravity's
  // Gemini vs Claude+GPT) get a right-click swap; the chosen key persists.
  const ringGroups = usageRingGroups(id);
  const selectedRingGroup = selectedRingGroups[id] ?? ringGroups[0]?.key;

  const item = (
    <div ref={ref} className={isDragging ? "opacity-40" : ""}>
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <button
            type="button"
            aria-label={t`${label} usage — open usage panel`}
            onClick={openUsagePanel}
            className="cursor-grab rounded-full outline-none focus-visible:focus-ring active:cursor-grabbing"
          >
            <ProviderUsageCircle
              kind={id}
              windows={snapshot?.windows}
              size={RAIL_CIRCLE_SIZE}
              ringGroup={selectedRingGroup}
            />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="top" offset={8} className="px-2 py-1.5 text-xs">
          <UsageTooltipBody
            id={id}
            label={label}
            snapshot={snapshot}
            swappable={ringGroups.length > 1}
          />
        </Tooltip.Content>
      </Tooltip>
    </div>
  );

  if (ringGroups.length <= 1) return item;

  const swapItems: ContextMenuEntry[] = ringGroups.map((g) => ({
    id: g.key,
    label: t`Show ${g.label}`,
    ...(g.key === selectedRingGroup ? { icon: <Check className="size-3.5" /> } : {}),
  }));
  return (
    <ContextMenu
      items={swapItems}
      onAction={(key) =>
        setUsageSetting("selectedRingGroups", { ...selectedRingGroups, [id]: key })
      }
    >
      {item}
    </ContextMenu>
  );
}

type ReorderHandler = (orderedRenderedIds: readonly string[]) => void;

/**
 * The sortable strip, shared by both orientations: the first `shownCount`
 * circles, then the "+N" chip for the rest. Only the circles are sortable, so a
 * drag always reorders within what the user can see.
 */
function UsageRailStrip(props: {
  providers: readonly UsageProvider[];
  shownCount: number;
  orientation: "row" | "column";
  onReorder: ReorderHandler;
}) {
  const { providers, shownCount, orientation, onReorder } = props;
  const shown = providers.slice(0, shownCount);
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
    const ids = shown.map((p) => p.id);
    const [moved] = ids.splice(fromIndex, 1);
    if (!moved) return;
    ids.splice(toIndex, 0, moved);
    onReorder(ids);
  }

  return (
    <DragDropProvider sensors={RAIL_SENSORS} onDragEnd={handleDragEnd}>
      <div className={STRIP[orientation].className} style={{ gap: STRIP[orientation].gap }}>
        {shown.map((p, index) => (
          <ProviderUsageRailItem key={p.id} id={p.id} label={p.label} index={index} group={group} />
        ))}
        <UsageOverflowChip providers={providers.slice(shownCount)} />
      </div>
    </DragDropProvider>
  );
}

/**
 * Expanded sidebar rail: as many circles as fit one row, then a "+N" chip whose
 * tooltip carries the rest. The row is measured rather than wrapped so the rail
 * keeps a fixed height as the sidebar is resized.
 */
function UsageRailRow(props: { providers: readonly UsageProvider[]; onReorder: ReorderHandler }) {
  const { providers, onReorder } = props;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState(0);

  // Measured before paint so the first frame is already fitted. Storing the
  // derived slot count rather than the raw width means a resize drag only
  // re-renders when a circle actually gains or loses its place. The measured div
  // is block-level, so its width follows the sidebar and never the circles
  // inside it — no measure/relayout feedback loop.
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = (width: number) => setSlots(railSlots(width));
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) measure(cr.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A labeled "Usage" section that sits between the thread list and the footer
  // nav. The column's gap above and the footer's top border below provide the
  // separation, so no extra dividers here — that avoids the cramped boxed strip.
  // `px-2` aligns the circles with the footer button icons.
  return (
    <div className="px-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
        <Trans>Usage</Trans>
      </p>
      <div ref={rowRef}>
        <UsageRailStrip
          providers={providers}
          shownCount={fitUsageRail(slots, providers.length)}
          orientation="row"
          onReorder={onReorder}
        />
      </div>
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

  // Full set drives the persisted order; the rail only offers the providers the
  // user hasn't individually hidden and that have usage worth a ring — a
  // signed-out provider belongs in Settings, not in the rail. Skipped providers
  // still hold their slot in `providerOrder` (the docked panel can reorder them).
  const allProviders = resolveDisplayedProviders(providerOrder, disabledProviders, agentInstances);
  // Subscribe to rail *eligibility* only. The snapshot map gets a new identity on
  // every refresh tick, so selecting it whole would re-render the rail (and every
  // circle) whenever any provider's percentages moved; each circle already reads
  // its own snapshot through a narrow selector.
  const eligible = useProviderUsageStore(
    useShallow((s) => allProviders.map((p) => hasRailUsage(s.snapshots[p.id]))),
  );
  const providers = allProviders.filter(
    (p, i) => !sidebarHiddenProviders.includes(p.id) && eligible[i],
  );

  if (!showInSidebar || providers.length === 0) return null;

  function handleReorder(orderedRenderedIds: readonly string[]) {
    // Splice the strip's new order back into the full order so hidden and
    // overflowed providers keep their absolute positions.
    const rendered = new Set(orderedRenderedIds);
    let v = 0;
    const next = allProviders.map((p) => (rendered.has(p.id) ? orderedRenderedIds[v++]! : p.id));
    startTransition(() => setUsageSetting("providerOrder", next));
  }

  // The collapsed rail is a fixed cap rather than a measured fit — it is one
  // narrow column sharing vertical space with the footer nav.
  if (orientation === "column") {
    return (
      <UsageRailStrip
        providers={providers}
        shownCount={RAIL_COLUMN_MAX}
        orientation="column"
        onReorder={handleReorder}
      />
    );
  }
  return <UsageRailRow providers={providers} onReorder={handleReorder} />;
}
