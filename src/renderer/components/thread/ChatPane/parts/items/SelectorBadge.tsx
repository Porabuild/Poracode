export const LC_SELECTOR_LANG = "lc-selector";

interface SelectorBadgePayload {
  selector?: string;
  url?: string;
  name?: string;
}

export function tryParseSelectorPayload(raw: string): SelectorBadgePayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as SelectorBadgePayload;
    if (typeof obj.selector !== "string" || obj.selector.length === 0) return null;
    return obj;
  } catch {
    return null;
  }
}

const SELECTOR_FENCE_RE = new RegExp("```" + LC_SELECTOR_LANG + "\\s*\\n([\\s\\S]*?)\\n```", "g");

export function stripSelectorPayloads(text: string): string {
  return text.replace(SELECTOR_FENCE_RE, "");
}

export function extractSelectorPayloads(text: string): SelectorBadgePayload[] {
  const out: SelectorBadgePayload[] = [];
  for (const match of text.matchAll(SELECTOR_FENCE_RE)) {
    const payload = tryParseSelectorPayload(match[1] ?? "");
    if (payload) out.push(payload);
  }
  return out;
}
