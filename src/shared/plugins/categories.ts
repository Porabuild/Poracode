/**
 * Canonical browse groups for marketplace and installed plugins.
 *
 * Every supported catalog exposes a free-form category (or nothing at all), and
 * the vocabularies differ by provider — `development`, `Developer Tools`, and
 * `developer-tools` all mean the same section here. Ids are stable; their
 * user-facing labels live in the renderer catalog so they can be translated.
 *
 * Unknown values intentionally normalize to `undefined`: callers decide whether
 * to show the authored label (detail pages) or an "Other" group (lists).
 */
export const PLUGIN_CATEGORY_ORDER = [
  "developer-tools",
  "productivity",
  "data-analytics",
  "monitoring",
  "security",
  "design",
  "deployment",
  "communication",
  "learning-research",
  "finance",
  "automation",
  "testing",
  "location",
  "migration",
  "business-operations",
] as const;

export type PluginCategoryGroupId = (typeof PLUGIN_CATEGORY_ORDER)[number];

/** Section used for values that do not map to a canonical group. */
export const PLUGIN_CATEGORY_OTHER = "other";

export type PluginCategorySectionId = PluginCategoryGroupId | typeof PLUGIN_CATEGORY_OTHER;

const CATEGORY_ALIASES: Readonly<Record<string, PluginCategoryGroupId>> = {
  "developer tools": "developer-tools",
  "developer tool": "developer-tools",
  development: "developer-tools",
  "dev tools": "developer-tools",
  devtool: "developer-tools",
  devtools: "developer-tools",
  engineering: "developer-tools",
  productivity: "productivity",
  automation: "automation",
  communication: "communication",
  messaging: "communication",
  "data analytics": "data-analytics",
  "data and analytics": "data-analytics",
  analytics: "data-analytics",
  database: "data-analytics",
  databases: "data-analytics",
  data: "data-analytics",
  monitoring: "monitoring",
  observability: "monitoring",
  security: "security",
  design: "design",
  "design and creativity": "design",
  creativity: "design",
  creative: "design",
  deployment: "deployment",
  devops: "deployment",
  infrastructure: "deployment",
  learning: "learning-research",
  "learning and research": "learning-research",
  education: "learning-research",
  "education and research": "learning-research",
  research: "learning-research",
  "scientific research": "learning-research",
  math: "learning-research",
  mathematics: "learning-research",
  finance: "finance",
  financial: "finance",
  testing: "testing",
  test: "testing",
  location: "location",
  "location and maps": "location",
  maps: "location",
  migration: "migration",
  "business and operations": "business-operations",
  "business operations": "business-operations",
  business: "business-operations",
  operations: "business-operations",
};

function categoryKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function canonicalPluginCategory(
  value: string | undefined,
): PluginCategoryGroupId | undefined {
  if (!value) return undefined;
  return CATEGORY_ALIASES[categoryKey(value)];
}

/** Stable ordering for a section id; source fallback sections sort between categories and "Other". */
export function pluginCategorySortOrder(id: PluginCategorySectionId): number {
  if (id === PLUGIN_CATEGORY_OTHER) return 200;
  return PLUGIN_CATEGORY_ORDER.indexOf(id);
}
