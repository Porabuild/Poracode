import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

const renderer = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const styles = dirname(require.resolve("@heroui/styles/package.json"));
const omittedFamilies = new Set([
  "calendar",
  "range-calendar",
  "calendar-year-picker",
  "date-field",
  "time-field",
  "date-input-group",
  "date-picker",
  "date-range-picker",
]);
const dateComponents = new Set([
  "Calendar",
  "RangeCalendar",
  "CalendarYearPicker",
  "DateField",
  "TimeField",
  "DateInputGroup",
  "DatePicker",
  "DateRangePicker",
]);

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec|fixtures?|testFixtures)\./.test(entry.name)
      ? [path]
      : [];
  });
}

describe("HeroUI stylesheet registration", () => {
  it("preserves the pinned component order, layers and non-component scaffold", () => {
    expect(JSON.parse(readFileSync(join(styles, "package.json"), "utf8")).version).toBe("3.2.4");
    const upstream = readFileSync(join(styles, "dist/components/index.css"), "utf8");
    const original = [...upstream.matchAll(/@import "\.\/([^"/]+)\.css";/g)].map(
      (match) => match[1],
    );
    const registry = readFileSync(join(renderer, "herouiStyles.css"), "utf8");
    const registered = [
      ...registry.matchAll(
        /@import "@heroui\/styles\/components\/([^"/]+)\.css" layer\(components\);/g,
      ),
    ].map((match) => match[1]);
    expect(original).toHaveLength(83);
    expect(registered).toEqual(original.filter((family) => !omittedFamilies.has(family!)));
    expect(registry).toContain("@layer theme, base, components, utilities;");
    expect(registry.indexOf('@import "tw-animate-css";')).toBeLessThan(
      registry.indexOf('@import "@heroui/styles/base" layer(base);'),
    );
    expect(registry).toContain('@import "@heroui/styles/base/scrollbar.css" layer(base);');
    expect(registry).toContain('@import "@heroui/styles/themes/default" layer(theme);');
    expect(registry).toContain('@import "@heroui/styles/utilities";');
    expect(registry).toContain('@import "@heroui/styles/variants";');
    // A theme upgrade must not silently bring omitted widgets back through a
    // second component registry, or move current overrides to another layer.
    expect(
      readFileSync(join(styles, "dist/themes/default/components/index.css"), "utf8"),
    ).not.toMatch(/@import\s/);
  });

  it("requires a style audit before introducing an omitted widget", () => {
    const missing: string[] = [];
    for (const path of productionSources(renderer)) {
      const source = readFileSync(path, "utf8");
      if (!source.includes("@heroui/react")) continue;
      const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
      for (const node of ast.program.body) {
        if (node.type !== "ImportDeclaration" || node.source.value !== "@heroui/react") continue;
        if (node.importKind === "type") continue;
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            missing.push(`${path}: audit namespace/default component access`);
            continue;
          }
          if (specifier.importKind === "type") continue;
          const name =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value;
          if (dateComponents.has(name)) missing.push(`${path}: register ${name} styles`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
