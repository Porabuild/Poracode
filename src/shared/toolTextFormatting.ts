export interface ToolTextPart {
  text: string;
  language: "plain" | "json" | "diff";
}

export function emptyToolTextPart(): ToolTextPart {
  return { text: "", language: "plain" };
}

export function toolTextPart(text: string): ToolTextPart {
  if (isUnifiedDiffText(text)) return { text, language: "diff" };
  return { text, language: isStructuredJsonText(text) ? "json" : "plain" };
}

export function isUnifiedDiffText(text: string): boolean {
  return /^diff --git [^\n]+$/m.test(text) && /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(text);
}

export function isStructuredJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!hasStructuredJsonDelimiters(trimmed)) return false;
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value !== null && typeof value === "object";
  } catch {
    return false;
  }
}

export function safeToolJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Object/array literals get two-space indentation; scalar text stays verbatim. */
export function prettyStructuredJson(text: string): string {
  const trimmed = text.trim();
  if (!hasStructuredJsonDelimiters(trimmed)) return text;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  } catch {
    // The original text is useful even when it only resembles JSON.
  }
  return text;
}

function hasStructuredJsonDelimiters(text: string): boolean {
  if (text.length < 2) return false;
  const head = text[0],
    tail = text[text.length - 1];
  return (head === "{" && tail === "}") || (head === "[" && tail === "]");
}
