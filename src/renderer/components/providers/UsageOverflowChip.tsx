import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { UsageWindow } from "@poracode/agents-usage/types";
import { openUsagePanel } from "@/renderer/actions/panelActions";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderUsageCircle } from "./ProviderUsageCircle";
import { formatWindowValue, usageStatusText } from "./usageFormat";
import { pickUsageRings, usageRingGroups, type UsageProvider } from "./usageProviders";
import { RAIL_CIRCLE_SIZE } from "./usageRailFit";

/** One compact line per overflowed provider: mini rings, label, ring values. */
function OverflowRow(props: { id: string; label: string }) {
  const { id, label } = props;
  const snapshot = useProviderUsage(id);
  const selectedRingGroups = useSharedSettings((s) => s.usage.selectedRingGroups);
  const ringGroup = selectedRingGroups[id] ?? usageRingGroups(id)[0]?.key;
  const rings = pickUsageRings(id, snapshot?.windows, ringGroup);
  // The same windows the circle draws — the tooltip stays a readout of the ring,
  // not a second, differently-sourced number.
  const shownWindows = [rings.outer, rings.inner].filter((w): w is UsageWindow => w !== undefined);
  return (
    <div className="flex items-center justify-between gap-3 whitespace-nowrap">
      <span className="flex items-center gap-1.5">
        <ProviderUsageCircle
          kind={id}
          windows={snapshot?.windows}
          size={16}
          ringGroup={ringGroup}
        />
        <span className="text-muted">{label}</span>
      </span>
      {shownWindows.length > 0 ? (
        <span className="font-medium text-foreground">
          {shownWindows.map(formatWindowValue).join(" · ")}
        </span>
      ) : (
        <span className="text-muted">{usageStatusText(snapshot, label, id)}</span>
      )}
    </div>
  );
}

/**
 * Overflow affordance for the usage rail: a "+N" circle standing in for the
 * providers that did not fit. Hovering lists every one of them in a single
 * compact line each, so a narrow sidebar hides circles but never information.
 * Clicking opens the docked usage panel, matching the circles it replaces.
 */
export function UsageOverflowChip(props: { providers: readonly UsageProvider[] }) {
  const { providers } = props;
  const { t } = useLingui();
  if (providers.length === 0) return null;
  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label={t`More usage providers — open usage panel`}
          onClick={openUsagePanel}
          className="flex shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-[10px] font-semibold text-muted outline-none hover:text-foreground focus-visible:focus-ring"
          style={{ width: RAIL_CIRCLE_SIZE, height: RAIL_CIRCLE_SIZE }}
        >
          +{providers.length}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" offset={8} className="px-2 py-1.5 text-xs">
        <div className="min-w-[160px] space-y-1">
          <p className="font-semibold text-foreground">
            <Trans>More providers</Trans>
          </p>
          <div className="space-y-0.5">
            {providers.map((p) => (
              <OverflowRow key={p.id} id={p.id} label={p.label} />
            ))}
          </div>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}
