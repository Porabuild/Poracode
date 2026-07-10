import type { UsageWindow } from "@lightcode/agents-usage/types";
import { ProviderIcon } from "./ProviderIcon";
import { pickUsageRings } from "./usageProviders";
import { usageToneColor } from "./usageTone";

/**
 * A provider icon wrapped in usage rings. Providers with a genuine short-vs-long
 * split (Claude/Codex: a 5h session plus a weekly window) render TWO concentric
 * rings — like a clock's hands, the faster session is the OUTER ring and the
 * slower weekly/monthly is the INNER ring, so a full inner ring flags "weekly
 * almost gone" even when the session is idle. Cursor renders Auto + Composer
 * outside and API inside. Antigravity shows one of its two quota groups (Gemini
 * vs Claude+GPT), selected via `ringGroup`. Every other provider renders a
 * SINGLE ring on its most-constrained window — an at-a-glance "closest to the
 * limit" read. Which windows map to which ring is a per-provider descriptor in
 * `usageProviders.ts` (see {@link pickUsageRings}). Each ring is colored by its
 * own tone. Reuses the ring math from ThreadContextIndicator.
 */

function Ring(props: { window: UsageWindow; radius: number }) {
  const { window, radius } = props;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, window.usedPercent));
  const progress = (pct / 100) * circumference;
  return (
    <>
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="color-mix(in oklab, var(--foreground) 18%, transparent)"
        strokeWidth="1.75"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke={usageToneColor(window.usedPercent)}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray={`${progress} ${circumference}`}
        transform="rotate(-90 12 12)"
      />
    </>
  );
}

export function ProviderUsageCircle(props: {
  kind: string;
  windows: readonly UsageWindow[] | undefined;
  size?: number;
  /** Selected ring group for multi-group providers (e.g. Antigravity). */
  ringGroup?: string | undefined;
}) {
  const { kind, windows, size = 28, ringGroup } = props;
  const { outer, inner } = pickUsageRings(kind, windows, ringGroup);
  const outerRadius = 11;
  const innerRadius = 7.5;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        className="absolute inset-0"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {outer ? (
          <Ring window={outer} radius={outerRadius} />
        ) : (
          <circle
            cx="12"
            cy="12"
            r={outerRadius}
            fill="none"
            stroke="color-mix(in oklab, var(--foreground) 18%, transparent)"
            strokeWidth="1.75"
          />
        )}
        {inner ? <Ring window={inner} radius={innerRadius} /> : null}
      </svg>
      <ProviderIcon kind={kind} fallbackLabel={kind} className="size-2.5" />
    </span>
  );
}
