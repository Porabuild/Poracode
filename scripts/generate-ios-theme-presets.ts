// Regenerate the SwiftUI palette from the renderer's authored and derived colors.
import { readFileSync, writeFileSync } from "node:fs";
import { THEME_SPECS, APP_THEME_PRESETS } from "../src/renderer/theme/themePresets";

const path = new URL("../ios/App/App/AppTheme.swift", import.meta.url);
const source = readFileSync(path, "utf8");
const start = "  // BEGIN GENERATED THEME PRESETS (scripts/generate-ios-theme-presets.ts)";
const end = "  // END GENERATED THEME PRESETS";
const first = source.indexOf(start);
const last = source.indexOf(end, first);
if (first < 0 || last < first) throw new Error("Missing generated Swift palette markers");

const lines = [start, "  static let all: [Self] = ["];
for (const [index, spec] of THEME_SPECS.entries()) {
  lines.push("    preset(", `      ${JSON.stringify(spec.id)}, ${JSON.stringify(spec.label)},`);
  for (const mode of ["light", "dark"] as const) {
    const anchor = spec[mode];
    const vars = APP_THEME_PRESETS[index]![mode];
    const values = [
      anchor.bg,
      anchor.surface,
      anchor.fg,
      anchor.accent,
      anchor.border,
      anchor.sidebar ?? anchor.surface,
      anchor.content ?? anchor.bg,
      vars["--content-surface-fill"],
      vars["--composer-surface"],
      vars["--field-placeholder"],
    ];
    lines.push(
      `      ${mode}: (${values.map((v) => JSON.stringify(v)).join(", ")})${mode === "light" ? "," : ""}`,
    );
  }
  lines.push("    ),");
}
lines.push("  ]", end);
const updated = source.slice(0, first) + lines.join("\n") + source.slice(last + end.length);
if (process.argv.includes("--check")) {
  if (source !== updated)
    throw new Error("Stale Swift palette. Run bun scripts/generate-ios-theme-presets.ts");
} else if (source !== updated) {
  writeFileSync(path, updated);
}
