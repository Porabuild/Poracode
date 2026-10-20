/** Authored HTML format; native visuals have a distinct version. */
export const INLINE_VISUAL_FORMAT_VERSION = 1 as const;
/** v2 excludes native visual bodies as well as HTML; derived search indexes must rebuild. */
export const INLINE_VISUAL_SEARCH_VERSION = 2 as const;
export const MAX_INLINE_VISUAL_BYTES = 256 * 1024;

export type InlineVisualPart =
  | { kind: "markdown"; text: string }
  | { kind: "visual"; version: number; title: string; html: string; complete: boolean }
  | { kind: "native"; version: number; title: string; source: string; complete: boolean };

/**
 * Visuals live in ordinary persisted assistant text, under the original item ID.
 * Unknown versions and unfinished fences stay identifiable but never execute.
 * Ordinary code fences are opaque, including examples of the visual format.
 */
export function splitInlineVisuals(text: string): InlineVisualPart[] {
  const parts: InlineVisualPart[] = [];
  let markdown = "";
  let fence: { marker: string; length: number } | undefined;
  let visual: Exclude<InlineVisualPart, { kind: "markdown" }> | undefined;
  for (const line of text.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    const body = line.replace(/\r?\n$/, "");
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(body);
    if (fence) {
      const closes =
        match &&
        match[1]![0] === fence.marker &&
        match[1]!.length >= fence.length &&
        match[2]!.trim() === "";
      if (closes) {
        if (visual) {
          visual.complete = true;
          parts.push(visual);
          visual = undefined;
        } else {
          markdown += line;
        }
        fence = undefined;
      } else if (visual?.kind === "visual") {
        visual.html += line;
      } else if (visual?.kind === "native") {
        visual.source += line;
      } else {
        markdown += line;
      }
      continue;
    }
    if (match && !(match[1]![0] === "`" && match[2]!.includes("`"))) {
      fence = { marker: match[1]![0]!, length: match[1]!.length };
      const header = /^poracode-(html|visual)-v(\d+)(?:[\t ]+(.*))?$/.exec(match[2]!.trim());
      if (header) {
        if (markdown) parts.push({ kind: "markdown", text: markdown });
        markdown = "";
        visual =
          header[1] === "html"
            ? {
                kind: "visual",
                version: Number(header[2]),
                title: (header[3] ?? "").trim().slice(0, 200),
                html: "",
                complete: false,
              }
            : {
                kind: "native",
                version: Number(header[2]),
                title: (header[3] ?? "").trim().slice(0, 200),
                source: "",
                complete: false,
              };
        continue;
      }
    }
    markdown += line;
  }
  if (visual) parts.push(visual);
  if (markdown) parts.push({ kind: "markdown", text: markdown });
  return parts;
}

/** Host-safe search text: surrounding prose and titles, never HTML or native source. */
export function inlineVisualSearchText(text: string): string {
  return splitInlineVisuals(text)
    .map((part) => (part.kind === "markdown" ? part.text : `\n${part.title}\n`))
    .join("");
}
