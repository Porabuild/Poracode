import type { UsageWindow } from "@lightcode/agents-usage";
import { ProviderIcon } from "./ProviderIcon";
import { usageToneColor } from "./usageTone";

/**
 * A provider icon wrapped in usage rings. Providers with a genuine short-vs-long
 * split (Claude/Codex: a 5h session plus a weekly window) render TWO concentric
 * rings — like a clock's hands, the faster session is the OUTER ring and the
 * slower weekly/monthly is the INNER ring, so a full inner ring flags "weekly
 * almost gone" even when the session is idle. Cursor renders Auto + Composer
 * outside and API inside. Every other provider renders a SINGLE ring on its
 * most-constrained window — an at-a-glance "closest to the limit" read. Each
 * ring is colored by its own tone. Reuses the ring math from
 * ThreadContextIndicator.
 */

function pickRings(
  kind: string,
  windows: readonly UsageWindow[] | undefined,
): {
  outer?: UsageWindow;
  inner?: UsageWindow;
} {
  if (!windows || windows.length === 0) return {};
  if (kind === "cursor") {
    const auto = windows.find((w) => w.id === "cursor-auto");
    const api = windows.find((w) => w.id === "cursor-api");
    if (auto && api) return { outer: auto, inner: api };
    if (auto) return { outer: auto };
    if (api) return { outer: api };
  }
  const session = windows.find((w) => w.id === "session-5h");
  const longer =
    windows.find((w) => w.id === "weekly") ??
    windows.find((w) => w.id === "monthly") ??
    windows.find((w) => w.id === "weekly-opus") ??
    windows.find((w) => w.id === "weekly-sonnet");
  // Two rings only where the short-vs-long split is real (Claude, Codex).
  if (session && longer) return { outer: session, inner: longer };
  // Everyone else: one ring on the most-constrained window.
  const worst = [...windows].sort((a, b) => b.usedPercent - a.usedPercent)[0];
  return worst ? { outer: worst } : {};
}

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
}) {
  const { kind, windows, size = 28 } = props;
  const { outer, inner } = pickRings(kind, windows);
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
