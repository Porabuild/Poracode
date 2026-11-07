/**
 * Presents each plan source line on its own row with light Markdown styling,
 * so the review reads like the rendered plan while every row still maps to
 * exactly one source line (feedback anchors to those line numbers). This is a
 * per-line presenter, not a Markdown parser: only fence state carries across
 * lines, and nothing here changes the text that is quoted back to the agent.
 */

export type PlanLineView =
  | { kind: "blank" }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; marker: string; indent: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "fence"; text: string }
  | { kind: "code"; text: string }
  | { kind: "rule" }
  | { kind: "text"; text: string };

const FENCE = /^\s*(`{3,}|~{3,})/;
// A closing `#` run is stripped only after whitespace, so "C#" keeps its `#`.
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export function describePlanLines(lines: readonly string[]): PlanLineView[] {
  let fence: string | null = null;
  return lines.map((line): PlanLineView => {
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1]![0] === fence[0] && fenceMatch[1]!.length >= fence.length) {
        fence = null;
        return { kind: "fence", text: line.trim() };
      }
      return { kind: "code", text: line };
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      return { kind: "fence", text: line.trim() };
    }
    if (line.trim() === "") return { kind: "blank" };
    const heading = HEADING.exec(line);
    if (heading) return { kind: "heading", level: heading[1]!.length, text: heading[2]! };
    if (RULE.test(line)) return { kind: "rule" };
    const list = LIST.exec(line);
    if (list) {
      const marker = /^\d/.test(list[2]!) ? list[2]! : "•";
      const indent = Math.min(4, Math.floor(list[1]!.replace(/\t/g, "  ").length / 2));
      return { kind: "list", marker, indent, text: list[3]! };
    }
    const quote = QUOTE.exec(line);
    if (quote) return { kind: "quote", text: quote[1]! };
    if (line.trimStart().startsWith("|")) return { kind: "code", text: line };
    return { kind: "text", text: line };
  });
}

export type PlanInlineToken =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string };

const INLINE = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*/g;

/** Inline `code` and **bold** only; everything else stays literal text. */
export function tokenizePlanInline(text: string): PlanInlineToken[] {
  const tokens: PlanInlineToken[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) tokens.push({ kind: "text", text: text.slice(last, index) });
    if (match[2] !== undefined) tokens.push({ kind: "code", text: match[2] });
    else tokens.push({ kind: "strong", text: match[3]! });
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}
