import {
  formatResetCountdown,
  projectWindowUsage,
  usageWindowDisplayLabel,
} from "@poracode/agents-usage/formatters";
import type { UsageProjection } from "@poracode/agents-usage/formatters";
import type { UsageWindow } from "@poracode/agents-usage/types";
import { formatPaceSummary, formatWindowSecondaryValue, formatWindowValue } from "./usageFormat";
import { usageToneColor } from "./usageTone";

/**
 * The usage bar with a forward-projection overlay: a solid fill at current
 * usage, a translucent "trajectory" extending to where usage is projected to
 * land by reset (capped at 100%), and a thin marker at that projected point.
 * The trajectory and marker are toned by the *projected* level, so a bar
 * heading into the red signals it before current usage gets there.
 */
function UsageBarTrack(props: { usedPercent: number; projection: UsageProjection | undefined }) {
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
    <div className="relative mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--separator)]">
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

/** Labeled horizontal bars for a provider's usage windows, colored by tone. */
export function UsageWindowBars(props: {
  windows: readonly UsageWindow[];
  className?: string;
  showReset?: boolean;
}) {
  const { windows, className, showReset = true } = props;
  const now = Date.now();
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      {windows.map((w) => {
        const reset =
          showReset && w.resetsAt !== undefined ? formatResetCountdown(w.resetsAt, now) : undefined;
        const secondary = formatWindowSecondaryValue(w);
        const projection = projectWindowUsage(w, now);
        const pace =
          projection && w.resetsAt !== undefined
            ? formatPaceSummary(projection, w.resetsAt, now)
            : undefined;
        return (
          <div key={w.id}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">{usageWindowDisplayLabel(w)}</span>
              <span className="tabular-nums text-foreground">
                {reset || secondary ? (
                  <span className="text-[11px] text-muted">
                    {[reset, secondary].filter(Boolean).join(" · ")} ·{" "}
                  </span>
                ) : null}
                {formatWindowValue(w)}
              </span>
            </div>
            <UsageBarTrack usedPercent={w.usedPercent} projection={projection} />
            {pace ? <PaceLine pace={pace} className="mt-1 text-[11px]" /> : null}
          </div>
        );
      })}
    </div>
  );
}
