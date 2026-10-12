import type { DevinModelFamily } from "./models";

type CatalogLine = { key: string; version: number[] };

/**
 * Native family slugs carry catalog version identity; opaque variant UIDs do
 * not. Compare versions only within a known model line, preserving distinct
 * Pro, Flash, Mini, Lightning and specialist lines. Unknown formats stay
 * visible. SWE's historical Fast family is the speed variant of its base line.
 */
function catalogLine(slug: string | undefined): CatalogLine | undefined {
  if (!slug) return undefined;
  const match =
    /^(claude-(?:opus|sonnet|haiku|fable)|gpt|glm|kimi-k|grok|gemini|deepseek-v|swe)-?(\d+(?:\.\d+)*)(?:-(sol|terra|luna|astra|mini|codex|flash|pro|lightning|fast))?$/.exec(
      slug,
    );
  if (!match) return undefined;
  const line = match[1]!;
  const tier = line === "swe" && match[3] === "fast" ? "" : (match[3] ?? "");
  return { key: `${line}:${tier}`, version: match[2]!.split(".").map(Number) };
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Exact catalog membership only; saved/launchable UIDs are never rewritten. */
export function devinDefaultHiddenModels(families: readonly DevinModelFamily[]): string[] {
  const newest = new Map<string, number[]>();
  for (const family of families) {
    const line = catalogLine(family.slug);
    if (!line) continue;
    const previous = newest.get(line.key);
    if (!previous || compareVersions(line.version, previous) > 0)
      newest.set(line.key, line.version);
  }
  return [
    ...new Set(
      families
        .filter((family) => {
          const line = catalogLine(family.slug);
          return line !== undefined && compareVersions(line.version, newest.get(line.key)!) < 0;
        })
        .flatMap((family) => family.variants.map((variant) => variant.id)),
    ),
  ];
}
