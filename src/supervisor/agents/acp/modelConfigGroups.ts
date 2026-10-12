/**
 * Project an ACP session-config select's grouped options onto the shared
 * sub-provider capability fields.
 *
 * `SessionConfigSelectGroup` (`{group, name?, options[]}`) is a standard ACP
 * select shape: when an agent groups its `model` menu, those groups are that
 * menu's sub-provider sections. The projection is purely structural —
 * `subProviders` carries the sections' order and labels, `modelSubProvider`
 * maps each advertised value id to its enclosing group id. Nothing here reads
 * or writes provider identifiers, and a flat menu — what every agent sends
 * while grouped config options are not negotiated — projects to `undefined`,
 * so callers emit nothing and existing behavior is unchanged.
 *
 * Structural rules, matched to the shared value walkers:
 * - Flat and grouped entries may interleave at any depth; a value belongs to
 *   its innermost enclosing group.
 * - Section order is document (first-seen) order; only groups that own at
 *   least one advertised value are emitted.
 * - A group's label is its `name`, falling back to its id when absent.
 * - A value id advertised under two groups keeps its first mapping: the
 *   duplicate is not an error, but projection must stay deterministic.
 * - A value id without a group (top-level entry) gains no membership.
 */

export interface ModelConfigGroupProjection {
  /** Section order + labels for the grouped menu. */
  subProviders: Array<{ id: string; label: string }>;
  /** Advertised value id → enclosing group id. */
  modelSubProvider: Record<string, string>;
}

/** Maximum group nesting the projection descends into (one level observed live). */
const MAX_GROUP_DEPTH = 8;

/** Maximum distinct sections a single menu may project (agent-owned, may vary). */
const MAX_GROUPS = 64;

/**
 * Maximum entries visited per menu. Bounds the projection for pathological
 * payloads; real menus are orders of magnitude below this.
 */
const MAX_OPTION_ENTRIES = 20_000;

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Project a select option list onto `subProviders` + `modelSubProvider`.
 * Returns `undefined` when nothing groups — a flat menu must not emit empty
 * section declarations.
 */
export function projectModelConfigGroups(options: unknown): ModelConfigGroupProjection | undefined {
  const labels = new Map<string, string>();
  const membership = new Map<string, string>();
  let visited = 0;

  const walk = (entries: unknown, inheritedGroup: string | undefined, depth: number): void => {
    if (!Array.isArray(entries) || depth > MAX_GROUP_DEPTH) return;
    for (const entry of entries) {
      if (visited >= MAX_OPTION_ENTRIES) return;
      visited += 1;
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const value = optionalTrimmedString(record.value);
      if (value) {
        if (inheritedGroup && !membership.has(value)) {
          membership.set(value, inheritedGroup);
        }
        continue;
      }
      const group = optionalTrimmedString(record.group);
      // At the section cap only already-known groups keep accepting members.
      if (
        group &&
        Array.isArray(record.options) &&
        (labels.size < MAX_GROUPS || labels.has(group))
      ) {
        if (!labels.has(group)) {
          labels.set(group, optionalTrimmedString(record.name) ?? group);
        }
        walk(record.options, group, depth + 1);
      }
    }
  };

  walk(options, undefined, 0);
  if (membership.size === 0) return undefined;

  // Only sections that own at least one projected value are emitted, so an
  // all-malformed group leaves no empty declaration behind.
  const usedGroups = new Set(membership.values());
  return {
    subProviders: [...labels]
      .filter(([id]) => usedGroups.has(id))
      .map(([id, label]) => ({ id, label })),
    // Object.fromEntries defines own data properties, so an agent-owned
    // `__proto__` id lands as a plain key instead of mutating a prototype.
    modelSubProvider: Object.fromEntries(membership),
  };
}
