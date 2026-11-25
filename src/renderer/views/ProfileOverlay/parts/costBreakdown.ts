import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { baseAgentKind } from "@/shared/contracts";
import type { ProfileCostTotals } from "@/shared/contracts/costHistory";
import { getProviderManifests } from "@/renderer/components/providers/providerManifest";

export interface CostShareSegment {
  readonly id: string;
  readonly label: MessageDescriptor;
  readonly value: number;
  readonly color: string;
}

/**
 * Curated chart series palette with distinct hues across registered providers.
 */
const SERIES_PALETTE = [
  "#d97757",
  "#60a5fa",
  "#4d9f8a",
  "#a78bfa",
  "#f59e0b",
  "#34d399",
  "#f472b6",
  "#38bdf8",
  "#fb923c",
  "#818cf8",
  "#2dd4bf",
  "#e879f9",
  "#a3e635",
  "#fb7185",
  "#94a3b8",
] as const;

let cachedManifestIndex: Map<string, number> | null = null;

function manifestIndexFor(base: string): number | undefined {
  if (!cachedManifestIndex) {
    cachedManifestIndex = new Map(
      getProviderManifests().map((manifest, index) => [manifest.kind.toLowerCase(), index]),
    );
  }
  return cachedManifestIndex.get(base);
}

/** Stable distinct accent color for any provider key without hardcoded provider literals. */
export function providerColor(providerKey: string): string {
  const base = baseAgentKind(providerKey).toLowerCase();
  const index = manifestIndexFor(base);
  if (index !== undefined) {
    return SERIES_PALETTE[index % SERIES_PALETTE.length]!;
  }
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  return SERIES_PALETTE[hash % SERIES_PALETTE.length]!;
}

const MODEL_KEY_SEPARATOR = String.fromCharCode(0x1f);

/** Extract the base provider key from a `modelKey` (`"provider:work\x1fmodel"` -> `"provider"`). */
export function providerKeyFromModelKey(key: string): string | undefined {
  const sep = key.indexOf(MODEL_KEY_SEPARATOR);
  if (sep <= 0) return undefined;
  return baseAgentKind(key.slice(0, sep));
}

/** Prompt cache hit rate (cache reads / total input including reads and writes). */
export function cacheHitRate(totals: ProfileCostTotals): number | null {
  if (totals.categorizedTokens <= 0) return null;
  const inputTotal =
    totals.categories.input + totals.categories.cacheRead + totals.categories.cacheWrite;
  if (inputTotal <= 0) return null;
  return totals.categories.cacheRead / inputTotal;
}

/** Effective cost per 1M priced tokens, or `null` when no tokens were priced. */
export function costPerMillionTokens(
  amount: number | undefined,
  pricedTokens: number,
): number | null {
  if (amount === undefined || pricedTokens <= 0) return null;
  return (amount / pricedTokens) * 1_000_000;
}

const ink = (percent: number) =>
  `color-mix(in oklab, var(--foreground) ${percent}%, var(--background))`;

const TYPE_COLORS = {
  input: ink(60),
  cacheRead: ink(30),
  cacheWrite: ink(74),
  output: ink(96),
  other: ink(44),
} as const;

/**
 * Dollar breakdown by token type (`Input`, `Cache read`, `Cache write`, `Output`,
 * plus `Other` for unsplit/provider-reported amounts not covered by list-rate categories).
 */
export function costTypeSegments(
  totals: ProfileCostTotals,
  activeAmount: number | undefined,
  activeBasisIsEstimate: boolean,
): readonly CostShareSegment[] {
  if (activeAmount === undefined || activeAmount <= 0) return [];
  const cat = totals.categoryCostUsd;
  const catSum = cat ? cat.input + cat.output + cat.cacheRead + cat.cacheWrite : 0;

  if (!cat || catSum <= 0) {
    return [{ id: "other", label: msg`Other`, value: activeAmount, color: TYPE_COLORS.other }];
  }

  // In provider-reported mode when a list-rate category split also exists for
  // the same samples, proportionally allocate the reported total (matching t3code).
  const scale = activeBasisIsEstimate ? 1 : activeAmount / catSum;
  const input = cat.input * scale;
  const cacheRead = cat.cacheRead * scale;
  const cacheWrite = cat.cacheWrite * scale;
  const output = cat.output * scale;
  const accounted = input + cacheRead + cacheWrite + output;
  const unsplit = Math.max(0, activeAmount - accounted);

  return [
    { id: "input", label: msg`Input`, value: input, color: TYPE_COLORS.input },
    { id: "cacheRead", label: msg`Cache read`, value: cacheRead, color: TYPE_COLORS.cacheRead },
    { id: "cacheWrite", label: msg`Cache write`, value: cacheWrite, color: TYPE_COLORS.cacheWrite },
    { id: "output", label: msg`Output`, value: output, color: TYPE_COLORS.output },
    {
      id: "other",
      label: msg`Other`,
      value: unsplit >= 0.005 ? unsplit : 0,
      color: TYPE_COLORS.other,
    },
  ];
}

/** Token breakdown by token category (`Input`, `Cache read`, `Cache write`, `Output`). */
export function tokenTypeSegments(totals: ProfileCostTotals): readonly CostShareSegment[] {
  if (totals.categorizedTokens <= 0) return [];
  return [
    { id: "input", label: msg`Input`, value: totals.categories.input, color: TYPE_COLORS.input },
    {
      id: "cacheRead",
      label: msg`Cache read`,
      value: totals.categories.cacheRead,
      color: TYPE_COLORS.cacheRead,
    },
    {
      id: "cacheWrite",
      label: msg`Cache write`,
      value: totals.categories.cacheWrite,
      color: TYPE_COLORS.cacheWrite,
    },
    {
      id: "output",
      label: msg`Output`,
      value: totals.categories.output,
      color: TYPE_COLORS.output,
    },
  ];
}

export { formatPercentShare } from "@/renderer/components/providers/usageFormat";

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** Fritsch-Carlson monotone cubic tangents (prevents curve overshoot below zero). */
function monotoneTangents(points: readonly ChartPoint[]): readonly number[] {
  const count = points.length;
  if (count < 2) return [0];

  const slopes: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const dx = points[i + 1]!.x - points[i]!.x;
    const dy = points[i + 1]!.y - points[i]!.y;
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  const tangents: number[] = Array.from({ length: count }, () => 0);
  tangents[0] = slopes[0] ?? 0;
  tangents[count - 1] = slopes[count - 2] ?? 0;
  for (let i = 1; i < count - 1; i += 1) {
    const prev = slopes[i - 1] ?? 0;
    const next = slopes[i] ?? 0;
    tangents[i] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }

  for (let i = 0; i < count - 1; i += 1) {
    const slope = slopes[i] ?? 0;
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    const mag = a * a + b * b;
    if (mag > 9) {
      const scale = 3 / Math.sqrt(mag);
      tangents[i] = scale * a * slope;
      tangents[i + 1] = scale * b * slope;
    }
  }
  return tangents;
}

/** Build a smooth monotone cubic SVG path for a contiguous point run. */
export function buildMonotoneLinePath(points: readonly ChartPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0]!;
    return `M${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  const tangents = monotoneTangents(points);
  let path = `M${points[0]!.x.toFixed(2)},${points[0]!.y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const dx = to.x - from.x;
    const c1x = from.x + dx / 3;
    const c1y = from.y + (tangents[i]! * dx) / 3;
    const c2x = to.x - dx / 3;
    const c2y = to.y - (tangents[i + 1]! * dx) / 3;
    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }
  return path;
}
