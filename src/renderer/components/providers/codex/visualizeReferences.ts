import { isChatFileSource } from "@/shared/chatFile";
import type {
  HtmlVisualFilePart,
  SplitHtmlVisualFileReferences,
} from "../../thread/ChatPane/parts/items/htmlVisualFileReference";
import { isEscaped, proseDirectives } from "./transcriptDirectiveRanges";

const VISUALIZE_START = "\ue200visualize\ue202";
const VISUALIZE_REFERENCE = /\ue200visualize\ue202([^\ue200\ue201]*)\ue201/gu;

/** Decode the visualization skill's reference in both live and saved assistant text. */
export const splitVisualizeReferences: SplitHtmlVisualFileReferences = (text) => {
  if (!text.includes(VISUALIZE_START)) return [{ kind: "markdown", text }];
  const candidates: {
    start: number;
    end: number;
    reference: Extract<HtmlVisualFilePart, { kind: "html-file" }>;
  }[] = [];
  for (const match of text.matchAll(VISUALIZE_REFERENCE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (isEscaped(text, start)) continue;
    const reference = parseReference(match[1]!);
    if (reference) candidates.push({ start, end, reference });
  }

  const parts: HtmlVisualFilePart[] = [];
  let cursor = 0;
  for (const { start, end, reference } of proseDirectives(text, candidates)) {
    if (start > cursor) parts.push({ kind: "markdown", text: text.slice(cursor, start) });
    parts.push(reference);
    cursor = end;
  }
  if (cursor < text.length || parts.length === 0) {
    parts.push({ kind: "markdown", text: text.slice(cursor) });
  }
  return parts;
};

function parseReference(source: string): Extract<HtmlVisualFilePart, { kind: "html-file" }> | null {
  let value: unknown;
  try {
    // Some replies put literal line breaks around the path inside the JSON
    // string. Escape them inside strings and keep whitespace between tokens.
    value = JSON.parse(
      source.replace(/"(?:\\[\s\S]|[^"\\])*"/gu, (quoted) => quoted.replace(/\r\n|\r|\n/gu, "\\n")),
    );
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("path" in value)) return null;
  if (typeof value.path !== "string") return null;
  const path = value.path.trim();
  if (!/\.html?$/iu.test(path) || !isChatFileSource(path)) return null;
  const title = "title" in value && typeof value.title === "string" ? value.title.trim() : "";
  return { kind: "html-file", path, title: title.slice(0, 200) };
}
