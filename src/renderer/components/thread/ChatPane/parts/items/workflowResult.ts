/**
 * Pure helpers behind the desktop `WorkflowResultGroup`: classify a workflow
 * tool's return text into the view the chat renders — a grouped result list,
 * a JSON code block, or plain inline text. The TUI transcript consumes the
 * same classification so both clients render workflow results identically.
 */

/** `<tool_use_error>…</tool_use_error>` is what Claude SDK emits when the tool itself rejected the call. */
export const TOOL_USE_ERROR_RE = /<tool_use_error>[\s\S]*?<\/tool_use_error>/i;

export interface ResultList {
  items: Record<string, unknown>[];
  labelKey: string | null;
  detailKeys: string[];
}

export type WorkflowResultView =
  | { kind: "none" }
  | { kind: "list"; list: ResultList; countLabel: string }
  | { kind: "json"; json: string }
  | { kind: "text"; text: string };

/**
 * Classify workflow result text the way `WorkflowResultGroup` renders it:
 * empty or tool-use-error text shows nothing, a parsed payload with an
 * array-of-objects becomes the grouped list, any other parsed non-string
 * JSON becomes a pretty-printed code block, and everything else is inline
 * text.
 */
export function workflowResultView(resultText: string): WorkflowResultView {
  const trimmed = resultText.trim();
  if (!trimmed || TOOL_USE_ERROR_RE.test(trimmed)) return { kind: "none" };
  const parsed = tryParseJson(trimmed);
  const list = parsed !== undefined ? findResultList(parsed) : null;
  if (list) {
    const itemNoun = list.labelKey ? prettifyKey(list.labelKey) : "result";
    const countLabel = `${list.items.length} ${list.items.length === 1 ? itemNoun : pluralize(itemNoun)}`;
    return { kind: "list", list, countLabel };
  }
  if (parsed !== undefined && typeof parsed !== "string") {
    return { kind: "json", json: safeStringify(parsed, 2) };
  }
  return { kind: "text", text: trimmed };
}

/**
 * Find the first array-of-objects in the parsed result. Workflows usually
 * stash their output array at the root or under a nested key like
 * `findings`, `confirmedBugs`, `dimensionSummaries` — sometimes through an
 * outer wrapper (`{result: {findings: [...]}}`). Walk a few levels deep so
 * common wrapper shapes resolve.
 */
export function findResultList(value: unknown, depth = 0): ResultList | null {
  if (depth > 3) return null;
  if (Array.isArray(value)) return buildResultList(value);
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const inner = obj[key];
    if (Array.isArray(inner)) {
      const built = buildResultList(inner);
      if (built) return built;
    }
  }
  // No array found at this level — recurse into nested objects.
  for (const key of Object.keys(obj)) {
    const inner = obj[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const built = findResultList(inner, depth + 1);
      if (built) return built;
    }
  }
  return null;
}

function buildResultList(raw: unknown[]): ResultList | null {
  const items: Record<string, unknown>[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      items.push(entry as Record<string, unknown>);
    }
  }
  if (items.length === 0) return null;
  const labelKey = pickLabelKey(items);
  const detailKeys = pickDetailKeys(items);
  return { items, labelKey, detailKeys };
}

const LABEL_PRIORITY = ["dimension", "area", "label", "title", "name", "key", "id", "category"];

const DETAIL_PRIORITY = [
  "summary",
  "detail",
  "description",
  "message",
  "reasoning",
  "content",
  "text",
  "note",
];

function pickLabelKey(items: Record<string, unknown>[]): string | null {
  for (const candidate of LABEL_PRIORITY) {
    if (items.every((item) => isNonEmptyString(item[candidate]))) return candidate;
  }
  for (const candidate of LABEL_PRIORITY) {
    if (items.some((item) => isNonEmptyString(item[candidate]))) return candidate;
  }
  return null;
}

function pickDetailKeys(items: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const candidate of DETAIL_PRIORITY) {
    if (items.some((item) => isNonEmptyString(item[candidate]))) out.push(candidate);
  }
  return out;
}

export function pickLabel(
  item: Record<string, unknown>,
  labelKey: string | null,
): string | undefined {
  if (labelKey && isNonEmptyString(item[labelKey])) return item[labelKey];
  for (const candidate of LABEL_PRIORITY) {
    if (isNonEmptyString(item[candidate])) return item[candidate];
  }
  return undefined;
}

/** The first non-empty detail field, matching the desktop row's collapsed text. */
export function pickResultDetail(
  item: Record<string, unknown>,
  detailKeys: string[],
): string | undefined {
  return detailKeys.map((key) => item[key]).find(isNonEmptyString);
}

export function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.endsWith("s") ? spaced.slice(0, -1) : spaced;
}

export function pluralize(noun: string): string {
  if (/(?:s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function safeStringify(value: unknown, indent?: number): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

export function summarizeObject(item: Record<string, unknown>): string {
  const pairs = Object.entries(item)
    .filter(([, value]) => value !== undefined)
    .slice(0, 3)
    .map(([key, value]) => {
      const rendered =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : safeStringify(value);
      return `${key}: ${rendered}`;
    });
  return pairs.join(" · ");
}
