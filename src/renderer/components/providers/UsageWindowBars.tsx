import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { formatResetCountdown, projectWindowUsage } from "@poracode/agents-usage/formatters";
import type { UsageProjection } from "@poracode/agents-usage/formatters";
import type { UsageWindow, UsageWindowBreakdownItem } from "@poracode/agents-usage/types";
import { useState, type KeyboardEvent } from "react";
import {
  usageWindowDisplayLabel,
  formatCount,
  formatMoney,
  formatPaceSummary,
  formatPercentShare,
  formatTokens,
  formatWindowSecondaryValue,
  formatWindowValue,
} from "./usageFormat";
import { usageToneColor } from "./usageTone";

const MAX_TOOLTIP_BREAKDOWN_ROWS = 8;

function formatBreakdownItemAmount(
  item: UsageWindowBreakdownItem,
  windowUnit: UsageWindow["unit"],
  fallbackCurrency: string | undefined,
): string | undefined {
  if (item.used === undefined) return undefined;
  const currency = item.currency ?? fallbackCurrency;
  const isMonetary = Boolean(currency) || windowUnit === "usd";
  if (isMonetary) {
    const used = formatMoney(item.used, currency);
    return item.limit !== undefined ? `${used} / ${formatMoney(item.limit, currency)}` : used;
  }
  const used = formatCount(item.used);
  return item.limit !== undefined ? `${used} / ${formatCount(item.limit)}` : used;
}

/** Hover/focus/tap tooltip body listing per-model or sub-bucket breakdown items for a window. */
function WindowBreakdownTooltipBody(props: {
  label: string;
  window: UsageWindow;
  breakdown: readonly UsageWindowBreakdownItem[];
}) {
  const { t } = useLingui();
  const { label, window: w, breakdown } = props;
  const visible = breakdown.slice(0, MAX_TOOLTIP_BREAKDOWN_ROWS);
  const hidden = breakdown.slice(MAX_TOOLTIP_BREAKDOWN_ROWS);
  const additiveParts = breakdown.length > 1 && breakdown.every((item) => item.limit === undefined);
  const subtotal = additiveParts ? breakdown.reduce((sum, item) => sum + (item.used ?? 0), 0) : 0;
  const totalTokens = breakdown.reduce((sum, item) => sum + (item.tokens ?? 0), 0);
  const hiddenTokens = hidden.reduce((sum, item) => sum + (item.tokens ?? 0), 0);
  const hiddenUsed = hidden.reduce((sum, item) => sum + (item.used ?? 0), 0);
  const hiddenCurrency = hidden.find((item) => item.currency)?.currency ?? w.currency;
  const hiddenIsMonetary = Boolean(hiddenCurrency) || w.unit === "usd";
  const secondary = formatWindowSecondaryValue(w);

  return (
    <div className="w-[min(18rem,calc(100vw-2rem))] space-y-1.5 py-0.5 text-xs font-normal">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--hairline-soft)] pb-1">
        <span className="truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">
          {[secondary, totalTokens > 0 ? t`${formatTokens(totalTokens)} tokens` : undefined]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="space-y-1">
        {visible.map((item, index) => {
          const amount = formatBreakdownItemAmount(item, w.unit, w.currency);
          const share =
            additiveParts && item.used !== undefined && subtotal > 0
              ? formatPercentShare(item.used / subtotal)
              : undefined;
          const tokens = item.tokens && item.tokens > 0 ? formatTokens(item.tokens) : undefined;
          return (
            <div
              key={`${item.label}:${index}`}
              className="flex items-baseline justify-between gap-3 text-[11px]"
            >
              <span className="min-w-0 truncate text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-foreground">
                {amount}
                {share ? <span className="ml-1 text-[10px] text-muted">{share}</span> : null}
                {tokens ? (
                  <span className="text-muted">{amount || share ? ` · ${tokens}` : tokens}</span>
                ) : null}
              </span>
            </div>
          );
        })}
        {hidden.length > 0 ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline-soft)] pt-1 text-[11px] text-muted">
            <span>{t`+${hidden.length} more`}</span>
            <span className="shrink-0 tabular-nums">
              {[
                hiddenUsed > 0
                  ? hiddenIsMonetary
                    ? formatMoney(hiddenUsed, hiddenCurrency)
                    : formatCount(hiddenUsed)
                  : undefined,
                hiddenTokens > 0 ? formatTokens(hiddenTokens) : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The usage bar with a forward-projection overlay: a solid fill at current
 * usage, a translucent "trajectory" extending to where usage is projected to
 * land by reset (capped at 100%), and a thin marker at that projected point.
 * The trajectory and marker are toned by the *projected* level, so a bar
 * heading into the red signals it before current usage gets there.
 */
function UsageBarTrack(props: {
  label: string;
  usedPercent: number;
  projection: UsageProjection | undefined;
}) {
  const { projection } = props;
  const used = Math.max(0, Math.min(100, props.usedPercent));
  const projected = projection ? Math.min(100, projection.projectedPercent) : undefined;
  const projTone = projection ? usageToneColor(projection.projectedPercent) : undefined;
  const hasTrajectory = projected !== undefined && projected - used > 0.5;
  // A discrete endpoint marker only reads when the quota lasts to reset and the
  // marker sits clear of the right edge; an over-pace trajectory fills to the
  // end and carries its own (danger) tone instead.
  const showMarker = hasTrajectory && projection?.lastsToReset === true && projected < 99.5;

  return (
    <div
      className="relative mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--separator)]"
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={used}
    >
      {hasTrajectory ? (
        <div
          className="absolute inset-y-0"
          style={{
            left: `${used}%`,
            width: `${projected - used}%`,
            backgroundColor: `color-mix(in oklab, ${projTone} 12%, transparent)`,
          }}
        />
      ) : null}
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${used}%`, backgroundColor: usageToneColor(props.usedPercent) }}
      />
      {showMarker ? (
        <div
          className="absolute inset-y-0 w-px -translate-x-1/2"
          style={{
            left: `${projected}%`,
            backgroundColor: `color-mix(in oklab, ${projTone} 55%, transparent)`,
          }}
        />
      ) : null}
    </div>
  );
}

/** One-line pace summary: a tone dot plus the projection text. Shared by the
 * usage card bars and the sidebar-rail hover tooltip. */
export function PaceLine(props: { pace: { text: string; toneColor: string }; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 leading-normal text-muted ${props.className ?? ""}`}>
      <span
        aria-hidden="true"
        className="size-1 shrink-0 rounded-full"
        style={{ backgroundColor: props.pace.toneColor }}
      />
      <span className="truncate">{props.pace.text}</span>
    </div>
  );
}

function UsageWindowBarRow(props: {
  window: UsageWindow;
  now: number;
  showReset: boolean;
  showPace: boolean;
}) {
  const { window: w, now, showReset, showPace } = props;
  const [open, setOpen] = useState(false);
  const reset =
    showReset && w.resetsAt !== undefined ? formatResetCountdown(w.resetsAt, now) : undefined;
  const secondary = formatWindowSecondaryValue(w);
  const label = usageWindowDisplayLabel(w);
  const projection = projectWindowUsage(w, now);
  const pace =
    showPace && projection && w.resetsAt !== undefined
      ? formatPaceSummary(projection, w.resetsAt, now)
      : undefined;
  const hasBreakdown = Boolean(w.breakdown && w.breakdown.length > 0);
  const rowContent = (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={
            hasBreakdown
              ? "min-w-0 truncate text-muted underline decoration-muted/40 decoration-dotted underline-offset-2 transition-colors group-hover/bar:text-foreground"
              : "min-w-0 truncate text-muted"
          }
        >
          {label}
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-foreground">
          {reset || secondary ? (
            <span className="text-[11px] text-muted">
              {[reset, secondary].filter(Boolean).join(" · ")} ·{" "}
            </span>
          ) : null}
          {formatWindowValue(w)}
        </span>
      </div>
      <UsageBarTrack label={label} usedPercent={w.usedPercent} projection={projection} />
    </div>
  );

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  return (
    <div>
      {hasBreakdown && w.breakdown ? (
        <Tooltip delay={150} isOpen={open} onOpenChange={setOpen} shouldCloseOnPress={false}>
          <Tooltip.Trigger
            role="group"
            aria-label={label}
            tabIndex={0}
            onClick={() => setOpen((prev) => !prev)}
            onKeyDown={onTriggerKeyDown}
            className="group/bar flex w-full cursor-default flex-col items-stretch rounded-xs text-left outline-none focus-visible:focus-ring"
          >
            {rowContent}
          </Tooltip.Trigger>
          <Tooltip.Content placement="top" offset={8} className="max-w-80 px-2.5 py-2">
            <WindowBreakdownTooltipBody label={label} window={w} breakdown={w.breakdown} />
          </Tooltip.Content>
        </Tooltip>
      ) : (
        rowContent
      )}
      {pace ? <PaceLine pace={pace} className="mt-1 text-[11px]" /> : null}
    </div>
  );
}

/** Labeled horizontal bars for a provider's usage windows, colored by tone. */
export function UsageWindowBars(props: {
  windows: readonly UsageWindow[];
  className?: string;
  showReset?: boolean;
  showPace?: boolean;
}) {
  const { windows, className, showReset = true, showPace = true } = props;
  // Snapshot once per mount: the countdown/projection labels below are
  // relative to this render's clock rather than an impure render-time read.
  const [now] = useState(() => Date.now());
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      {windows.map((w) => (
        <UsageWindowBarRow
          key={w.id}
          window={w}
          now={now}
          showReset={showReset}
          showPace={showPace}
        />
      ))}
    </div>
  );
}
