#!/usr/bin/env bun
/**
 * Generates android/app/src/main/kotlin/com/poracode/app/ui/theme/PoracodeThemePresets.kt
 * from the PWA theme source of truth.
 *
 * Sources:
 *  - Non-default presets: THEME_SPECS anchors + buildVariant() from
 *    src/renderer/theme/themeTokens.ts (the same derivation the renderer applies
 *    when a preset overrides the base theme).
 *  - `default`: the base `.light` / `.dark` cascade in src/renderer/styles.css
 *    plus the `html[data-compact-layout]` mobile overrides — because the renderer
 *    clears all managed-var overrides for the base theme, styles.css is the
 *    runtime source of truth for `default`.
 *  - Shared non-managed tokens (hairlines, row wash, accent-soft foreground,
 *    status tones) come from `:root` / `.light` / `.dark` and reference the
 *    themed --foreground / --accent / --muted, so they adapt per preset.
 *
 * CSS color math (OKLab color-mix with premultiplied alpha, oklch literals,
 * color-mix percentages and `transparent` fades) is implemented below per CSS
 * Color 4/5 so every var resolves to a concrete sRGB + alpha.
 *
 * Usage: bun scripts/generate-android-themes.ts [--check]
 *   --check exits non-zero when the committed Kotlin file is stale.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME_SPECS } from "@/renderer/theme/themePresets";
import { buildVariant } from "@/renderer/theme/themeTokens";

// ---------------------------------------------------------------------------
// CSS color engine (sRGB <-> OKLab, color-mix(in oklab,...) premultiplied alpha)
// ---------------------------------------------------------------------------

type Rgba = [number, number, number, number]; // 0..1 rgb + alpha
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toByte = (v: number) => Math.round(Math.min(255, Math.max(0, v * 255)));

function parseHex(hex: string): Rgba {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}
function hexToArgbLong(c: Rgba): string {
  const p = (v: number) => toByte(v).toString(16).padStart(2, "0").toUpperCase();
  return `0x${p(c[3])}${p(c[0])}${p(c[1])}${p(c[2])}`;
}
function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function linearSrgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l),
    m_ = Math.cbrt(m),
    s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}
function oklabToLinearSrgb([L, a, b]: [number, number, number]): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function srgbToOklab(c: Rgba): [number, number, number] {
  return linearSrgbToOklab([srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])]);
}
function oklabToSrgb(lab: [number, number, number]): [number, number, number] {
  const [r, g, b] = oklabToLinearSrgb(lab);
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}
function oklchToOklab(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function unwrapParens(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    // only strip if the outer parens wrap the whole expression
    let depth = 0,
      wraps = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") depth++;
      else if (t[i] === ")") {
        depth--;
        if (depth === 0 && i < t.length - 1) {
          wraps = false;
          break;
        }
      }
    }
    if (!wraps || depth !== 0) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

function parseColor(input: string): Rgba | null {
  const s = unwrapParens(input.trim()).toLowerCase();
  if (s === "transparent") return [0, 0, 0, 0];
  if (s === "white") return [1, 1, 1, 1];
  if (s === "black") return [0, 0, 0, 1];
  if (s.startsWith("#")) return parseHex(s);
  const m = s.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a =
      m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const [r, g, b] = oklabToSrgb(
      oklchToOklab(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])),
    );
    return [clamp01(r), clamp01(g), clamp01(b), a];
  }
  const rgbM = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgbM) {
    const parts = rgbM[1].split(/[\s,/]+/).filter(Boolean);
    const [r, g, b] = parts
      .slice(0, 3)
      .map((v) => clamp01(v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / 255));
    let a = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if (parts[3]?.endsWith("%")) a = parseFloat(parts[3]) / 100;
    return [r, g, b, a];
  }
  return null;
}

function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0,
    cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Evaluate a CSS color expression (hex/oklch/rgba/color-mix/var refs) to sRGB+alpha. */
export function evalCssColor(expr: string, vars: Record<string, string>, depth = 0): Rgba | null {
  if (depth > 16) return null;
  let e = unwrapParens(expr.trim());
  e = e.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_m, name: string, fb?: string) => {
    const v = vars[name];
    if (v !== undefined && v.trim() !== "") return `(${v})`;
    return fb !== undefined ? `(${fb.trim()})` : "transparent";
  });
  const cm = e.match(/^color-mix\(in\s+oklab\s*,\s*(.+)\)$/i);
  if (!cm) return parseColor(e);
  const parts = splitTopLevel(cm[1]);
  if (parts.length !== 2) return null;
  const parsePart = (p: string) => {
    const pm = p.trim().match(/^(.*?)\s+(-?[\d.]+)%?\s*$/);
    if (pm) {
      const c = parseColor(pm[1].trim());
      return c ? { color: pm[1].trim(), pct: parseFloat(pm[2]) } : null;
    }
    const c = parseColor(p.trim());
    return c ? { color: p.trim(), pct: null } : null;
  };
  const A = parsePart(parts[0]),
    B = parsePart(parts[1]);
  if (!A || !B) return null;
  // Resolve nested color-mix operands recursively by re-evaluating to Rgba.
  const ca = evalCssColor(A.color, vars, depth + 1);
  const cb = evalCssColor(B.color, vars, depth + 1);
  if (!ca || !cb) return null;
  let p1 = A.pct ?? 100,
    p2 = B.pct ?? 100;
  if (A.pct === null && B.pct === null) {
    p1 = 50;
    p2 = 50;
  } else if (A.pct === null) p1 = 100 - p2;
  else if (B.pct === null) p2 = 100 - p1;
  const sum = p1 + p2,
    w1 = p1 / sum,
    w2 = p2 / sum;
  const labA = srgbToOklab(ca),
    labB = srgbToOklab(cb);
  const a1 = ca[3],
    a2 = cb[3];
  const outA = w1 * a1 + w2 * a2;
  if (outA <= 1e-6) return [0, 0, 0, 0];
  const labOut: [number, number, number] = [0, 1, 2].map(
    (i) => (labA[i]! * a1 * w1 + labB[i]! * a2 * w2) / outA,
  ) as [number, number, number];
  const [r, g, b] = oklabToSrgb(labOut);
  return [clamp01(r), clamp01(g), clamp01(b), outA];
}

/** Evaluate every `--var: <color-expr>` in `vars`, resolving var()/color-mix. */
function resolveVars(raw: Record<string, string>): Record<string, Rgba | null> {
  const out: Record<string, Rgba | null> = {};
  for (const k of Object.keys(raw)) out[k] = evalCssColor(raw[k], raw);
  return out;
}

// ---------------------------------------------------------------------------
// styles.css cascade extraction (for `default` base + fixed per-mode tones)
// ---------------------------------------------------------------------------

// Strip comments so they cannot pollute selector text (a `/* … */` between rules
// would otherwise be absorbed into the next selector and rejected as a component rule).
const STYLES_CSS = readFileSync(
  resolve(import.meta.dirname, "../src/renderer/styles.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

interface Decl {
  sel: string;
  name: string;
  value: string;
  order: number;
}
const decls: Decl[] = [];
{
  let order = 0;
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(STYLES_CSS))) {
    const sel = m[1].trim(),
      body = m[2];
    if (!body.includes("--")) continue;
    for (const dm of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      decls.push({ sel, name: dm[1], value: dm[2].trim(), order: order++ });
    }
  }
}

interface ThemeScope {
  mode: "light" | "dark" | "both";
  compact: boolean;
  presetDefaultOnly: boolean;
  spec: number;
}

/**
 * Classify one comma-separated selector into a theme-root scope, or null when it
 * is a component rule. Theme vars live only on bare root selectors (`:root`,
 * `[data-theme]`, `html[data-compact-layout]…`); descendant/component selectors
 * such as `html[…] :is(.row)` are rejected so scoped `--muted`-style tweaks do
 * not leak into the theme palette.
 */
function classifySelector(rawPart: string): ThemeScope | null {
  const s = rawPart.trim();
  if (!s) return null;
  // Reject anything with a combinator, descendant, or element-targeting pseudo.
  if (/[\s>+~]/.test(s) || s.includes(":is(") || s.includes(":where(") || s.includes("::"))
    return null;
  const compact = s.includes("data-compact-layout");
  const isRoot = s === ":root" || s.startsWith(":root");
  const hasLight = s.includes('data-theme="light"');
  const hasDark = s.includes('data-theme="dark"');
  // Platform gates: Android is a non-iOS, non-Windows compact target.
  if (s.includes('data-mobile-platform="windows"')) return null;
  const notIos = s.includes(':not([data-mobile-platform="ios"])');
  if (s.includes('data-mobile-platform="ios"') && !notIos) return null;
  const mode: ThemeScope["mode"] = hasDark ? "dark" : hasLight ? "light" : "both";
  const presetDefaultOnly = s.includes('data-theme-preset="default"');
  let spec: number;
  if (isRoot) spec = 1;
  else if (compact && presetDefaultOnly) spec = 1000;
  else if (compact && hasDark) spec = 600;
  else if (compact && hasLight) spec = 600;
  else if (compact && notIos) spec = 560;
  else if (compact) spec = 500;
  else if (hasDark || hasLight) spec = 200;
  else return null; // not a recognized theme selector
  return { mode, compact, presetDefaultOnly, spec };
}

/** All theme scopes a declaration's selector list contributes to. */
function scopesOf(sel: string): ThemeScope[] {
  const out: ThemeScope[] = [];
  for (const part of sel.split(",")) {
    const sc = classifySelector(part);
    if (sc) out.push(sc);
  }
  return out;
}

/** Resolve the styles.css custom-property cascade for a mode + preset. */
export function resolveStylesCss(
  mode: "light" | "dark",
  presetId: string,
  opts: { baseOnly?: boolean } = {},
): Record<string, Rgba | null> {
  const isDefault = presetId === "default";
  const winners = new Map<string, { value: string; spec: number; order: number }>();
  for (const d of decls) {
    for (const sc of scopesOf(d.sel)) {
      if (sc.mode !== "both" && sc.mode !== mode) continue;
      if (sc.presetDefaultOnly && !isDefault) continue;
      if (opts.baseOnly && sc.spec > 200) continue; // :root + [data-theme] only
      // Non-compact theme blocks only apply when not in compact? No — compact
      // layers on top; base theme always applies. Compact specs outrank base.
      const cur = winners.get(d.name);
      if (!cur || sc.spec > cur.spec || (sc.spec === cur.spec && d.order > cur.order)) {
        winners.set(d.name, { value: d.value, spec: sc.spec, order: d.order });
      }
    }
  }
  const raw: Record<string, string> = {};
  for (const [k, v] of winners) raw[k] = v.value;
  // --snow is a HeroUI/base token not declared in styles.css; the app treats it
  // as the snow white (matches Kotlin `Snow` and the `var(--snow, white)` fallbacks).
  raw["--snow"] ??= "#FCFCFC";
  // Iteratively substitute var() refs textually, then evaluate colors.
  const text: Record<string, string> = {};
  const subst = (expr: string, depth: number): string => {
    if (depth > 14) return expr;
    return expr.replace(
      /var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g,
      (_m, name: string, fb?: string) => {
        const v = text[name] ?? raw[name];
        if (v !== undefined && v.trim() !== "") return `(${subst(v, depth + 1)})`;
        return fb !== undefined ? `(${fb.trim()})` : "transparent";
      },
    );
  };
  for (const k of Object.keys(raw)) text[k] = subst(raw[k], 0);
  return resolveVars(text);
}

// ---------------------------------------------------------------------------
// Field mapping: resolved CSS vars -> PoracodeColors fields
// ---------------------------------------------------------------------------

interface FieldDef {
  name: string;
  comment: string;
}

// The order must match PoracodeColors' constructor.
const FIELD_ORDER: FieldDef[] = [
  { name: "isDark", comment: "color scheme" },
  { name: "background", comment: "--background" },
  { name: "foreground", comment: "--foreground" },
  { name: "muted", comment: "--muted" },
  { name: "surface", comment: "--surface" },
  { name: "surfaceSecondary", comment: "--surface-secondary" },
  { name: "surfaceTertiary", comment: "--surface-tertiary" },
  { name: "overlay", comment: "--overlay" },
  { name: "listRow", comment: "--m-list-row-surface (compact)" },
  { name: "glass", comment: "--m-glass-surface (compact, non-iOS alpha 80%)" },
  { name: "composerSurface", comment: "--composer-surface" },
  { name: "default", comment: "--default" },
  { name: "accent", comment: "--accent" },
  { name: "accentForeground", comment: "--accent-foreground" },
  { name: "accentSoft", comment: "fade(--accent) soft wash (mode-tuned alpha)" },
  { name: "accentSoftForeground", comment: "--color-accent-soft-foreground" },
  { name: "success", comment: "--success (fixed per mode)" },
  { name: "successForeground", comment: "--success-foreground (fixed)" },
  { name: "warning", comment: "--warning (fixed per mode)" },
  { name: "warningForeground", comment: "--warning-foreground (fixed)" },
  { name: "danger", comment: "--danger (fixed per mode)" },
  { name: "dangerForeground", comment: "--danger-foreground (fixed)" },
  { name: "fieldBackground", comment: "--field-background" },
  { name: "fieldPlaceholder", comment: "--field-placeholder" },
  { name: "fieldBorder", comment: "--field-border" },
  { name: "segment", comment: "--segment" },
  { name: "border", comment: "--border" },
  { name: "separator", comment: "--separator" },
  { name: "hairline", comment: "--hairline = color-mix(--foreground 9%, transparent)" },
  {
    name: "hairlineStrong",
    comment: "--hairline-strong = color-mix(--foreground 15%, transparent)",
  },
  { name: "rowActive", comment: "--row-active = color-mix(--foreground 11%/20%, transparent)" },
  { name: "finishedTone", comment: "--finished-tone (fixed per mode)" },
  { name: "prMerged", comment: "--pr-merged (fixed per mode)" },
  { name: "gitBranchTone", comment: "--git-branch-tone (light fixed / dark = --muted)" },
  { name: "floatingShadow", comment: "fixed shadow tint (not themed)" },
  { name: "scrim", comment: "fixed scrim (not themed)" },
];

const SNOW = parseHex("#fcfcfc");

// Status/semantic tones + floating chrome. These are NOT themed by presets
// (themeTokens keeps them on the base values) and styles.css only declares the
// light variants — the dark success/warning/danger the app renders come from the
// platform/HeroUI layer, so the per-mode constants below are the ground truth
// (they already match the PWA's rendered values).
const FIXED = {
  light: {
    success: parseHex("#006C1A"),
    successForeground: SNOW,
    warning: parseHex("#8E5500"),
    warningForeground: SNOW,
    danger: parseHex("#B30018"),
    dangerForeground: SNOW,
    finishedTone: parseHex("#306CE2"),
    prMerged: parseHex("#6946BF"),
    floatingShadow: parseHex("#0F172A14"),
    scrim: parseHex("#00000052"),
  },
  dark: {
    success: parseHex("#17C964"),
    successForeground: parseHex("#18181B"),
    warning: parseHex("#F7B750"),
    warningForeground: parseHex("#18181B"),
    danger: parseHex("#ED4A4A"),
    dangerForeground: SNOW,
    finishedTone: parseHex("#96C5FF"),
    prMerged: parseHex("#A287FE"),
    floatingShadow: parseHex("#00000059"),
    scrim: parseHex("#00000099"),
  },
} as const;

const FIXED_FIELDS = [
  "success",
  "successForeground",
  "warning",
  "warningForeground",
  "danger",
  "dangerForeground",
  "finishedTone",
  "prMerged",
  "floatingShadow",
  "scrim",
] as const;

function fade(color: Rgba, pct: number): Rgba {
  return [color[0], color[1], color[2], color[3] * (pct / 100)];
}
function mixOk(c1: Rgba, w1: number, c2: Rgba): Rgba {
  const lab1 = srgbToOklab(c1),
    lab2 = srgbToOklab(c2);
  const w2 = 1 - w1;
  const [r, g, b] = oklabToSrgb([
    w1 * lab1[0] + w2 * lab2[0],
    w1 * lab1[1] + w2 * lab2[1],
    w1 * lab1[2] + w2 * lab2[2],
  ]);
  return [clamp01(r), clamp01(g), clamp01(b), w1 * c1[3] + w2 * c2[3]];
}

/** Build one PoracodeColors for a preset+mode. */
function buildColors(presetId: string, mode: "light" | "dark"): Map<string, Rgba | boolean> {
  const isDefault = presetId === "default";
  // Themed vars: default -> styles.css cascade; others -> buildVariant anchors.
  const themed: Record<string, Rgba | null> = {};
  if (isDefault) {
    const v = resolveStylesCss(mode, "default");
    for (const k of Object.keys(v)) themed[k] = v[k];
  } else {
    const spec = THEME_SPECS.find((s) => s.id === presetId)!;
    const vars = buildVariant(mode === "dark" ? spec.dark : spec.light, mode);
    const resolved = resolveVars(vars);
    for (const k of Object.keys(resolved)) themed[k] = resolved[k];
  }
  const g = (name: string): Rgba => {
    const v = themed[name];
    if (!v) throw new Error(`missing var ${name} for ${presetId}/${mode}`);
    return v;
  };
  const fg = g("--foreground"),
    accent = g("--accent"),
    muted = g("--muted");
  const composerSurface = g("--composer-surface");
  const out = new Map<string, Rgba | boolean>();
  out.set("isDark", mode === "dark");

  // Direct managed vars.
  out.set("background", g("--background"));
  out.set("foreground", fg);
  out.set("muted", muted);
  out.set("surface", g("--surface"));
  out.set("surfaceSecondary", g("--surface-secondary"));
  out.set("surfaceTertiary", g("--surface-tertiary"));
  out.set("overlay", g("--overlay"));
  out.set("composerSurface", composerSurface);
  out.set("default", g("--default"));
  out.set("accent", accent);
  out.set("accentForeground", g("--accent-foreground"));
  out.set("fieldBackground", g("--field-background"));
  out.set("fieldPlaceholder", g("--field-placeholder"));
  out.set("fieldBorder", g("--field-border"));
  out.set("segment", g("--segment"));
  out.set("border", g("--border"));
  out.set("separator", g("--separator"));

  // Compact-layout derived surfaces.
  // --m-list-row-surface: light -> #fff (all light compact); dark default -> #1c1c1e;
  // dark non-default -> color-mix(--foreground 14%, transparent).
  if (mode === "light") out.set("listRow", parseHex("#ffffff"));
  else if (isDefault) out.set("listRow", parseHex("#1c1c1e"));
  else out.set("listRow", fade(fg, 14));
  // --m-glass-surface = color-mix(--composer-surface 80%, transparent) for the
  // non-iOS compact target Android matches; dark default -> #1c1c1e override.
  if (isDefault && mode === "dark") out.set("glass", parseHex("#1c1c1e"));
  else out.set("glass", fade(composerSurface, 80));

  // Soft accent wash + readable accent text.
  out.set("accentSoft", fade(accent, mode === "light" ? 15 : 12));
  // accentSoftForeground has no exact CSS source: --color-accent-soft-foreground
  // is `color-mix(accent 65%, foreground)` (#444e91/#aeb7f5) but the hand-tuned
  // Android values are deeper/lighter. `default` keeps the tuned literals; other
  // presets derive an accent-tinted equivalent via accent ~74% + foreground.
  if (isDefault) {
    out.set("accentSoftForeground", mode === "light" ? parseHex("#4A54A6") : parseHex("#A5AEF4"));
  } else {
    out.set("accentSoftForeground", mixOk(accent, 0.74, fg));
  }

  // Interaction washes derived from --foreground.
  out.set("hairline", fade(fg, 9));
  out.set("hairlineStrong", fade(fg, 15));
  out.set("rowActive", fade(fg, mode === "dark" ? 20 : 11));

  // --git-branch-tone: light -> fixed .light literal; dark -> var(--muted).
  out.set("gitBranchTone", mode === "light" ? parseHex("#3E5FAD") : muted);

  // Status/semantic tones + floating chrome are fixed per-mode constants shared
  // by every preset (presets do not theme them).
  const fx = FIXED[mode];
  for (const k of FIXED_FIELDS) out.set(k, fx[k]);
  return out;
}

// ---------------------------------------------------------------------------
// Kotlin emission
// ---------------------------------------------------------------------------

function colorLiteral(v: Rgba | boolean): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  return `Color(${hexToArgbLong(v)})`;
}

function emit(): string {
  const lines: string[] = [];
  lines.push("// Generated by scripts/generate-android-themes.ts, do not edit.");
  lines.push("// Source of truth: src/renderer/theme/themePresets.ts + themeTokens.ts");
  lines.push("// (buildVariant) and the compact-layout cascade in src/renderer/styles.css.");
  lines.push("// Regenerate with: bun scripts/generate-android-themes.ts");
  lines.push("package com.poracode.app.ui.theme");
  lines.push("");
  lines.push("import androidx.compose.ui.graphics.Color");
  lines.push("");
  lines.push("/** One resolved light/dark PoracodeColors for a selectable theme preset. */");
  lines.push("data class PoracodeThemePreset(");
  lines.push("    val id: String,");
  lines.push("    val label: String,");
  lines.push("    val light: PoracodeColors,");
  lines.push("    val dark: PoracodeColors,");
  lines.push(")");
  lines.push("");
  lines.push(
    "private fun preset(id: String, label: String, light: PoracodeColors, dark: PoracodeColors) =",
  );
  lines.push("    PoracodeThemePreset(id, label, light, dark)");
  lines.push("");
  lines.push("internal val PoracodeThemePresets: List<PoracodeThemePreset> = listOf(");

  for (const spec of THEME_SPECS) {
    const light = buildColors(spec.id, "light");
    const dark = buildColors(spec.id, "dark");
    const label = spec.label.replace(/"/g, '\\"');
    lines.push(`    preset("${spec.id}", "${label}",`);
    lines.push(`        light = PoracodeColors(`);
    for (const f of FIELD_ORDER) {
      lines.push(
        `            ${f.name} = ${colorLiteral(light.get(f.name) as any)}, // ${f.comment}`,
      );
    }
    lines.push(`        ),`);
    lines.push(`        dark = PoracodeColors(`);
    for (const f of FIELD_ORDER) {
      lines.push(
        `            ${f.name} = ${colorLiteral(dark.get(f.name) as any)}, // ${f.comment}`,
      );
    }
    lines.push(`        ),`);
    lines.push(`    ),`);
  }
  lines.push(")");
  lines.push("");
  lines.push("private val PoracodeThemePresetsById = PoracodeThemePresets.associateBy { it.id }");
  lines.push("");
  lines.push("/** Resolve a persisted theme id to its preset, falling back to default. */");
  lines.push("fun poracodeThemePreset(id: String?): PoracodeThemePreset =");
  lines.push(
    "    PoracodeThemePresetsById[normalizeThemeId(id)] ?: PoracodeThemePresetsById.getValue(DEFAULT_PORACODE_THEME_ID)",
  );
  lines.push("");
  lines.push('const val DEFAULT_PORACODE_THEME_ID = "default"');
  lines.push("");
  lines.push("/** Map legacy persisted ids onto the PWA/iOS theme ids; unknown -> default. */");
  lines.push("fun normalizeThemeId(id: String?): String {");
  lines.push("    val mapped = when (id) {");
  lines.push('        "lightcode-legacy" -> "poracode-legacy"');
  lines.push("        null -> DEFAULT_PORACODE_THEME_ID");
  lines.push("        else -> id");
  lines.push("    }");
  lines.push(
    "    return if (PoracodeThemePresetsById.containsKey(mapped)) mapped else DEFAULT_PORACODE_THEME_ID",
  );
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

const OUT = resolve(
  import.meta.dirname,
  "../android/app/src/main/kotlin/com/poracode/app/ui/theme/PoracodeThemePresets.kt",
);
const generated = emit();
const check = process.argv.includes("--check");
if (check) {
  const current = readFileSync(OUT, "utf8");
  if (current !== generated) {
    console.error("PoracodeThemePresets.kt is stale — run: bun scripts/generate-android-themes.ts");
    process.exit(1);
  }
  console.log("PoracodeThemePresets.kt is up to date.");
} else {
  writeFileSync(OUT, generated);
  console.log(`Wrote ${OUT} (${THEME_SPECS.length} presets)`);
}
