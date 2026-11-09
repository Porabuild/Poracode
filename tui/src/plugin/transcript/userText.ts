import {
  PROJECT_PATH_TOKEN_SOURCE,
  parseChatPathRef,
  parseProjectPathRef,
  type ProjectPathRef,
} from "../../desktop/presentation";
import { chatPathChipLabel } from "./chatMarkdown";

export type UserTextSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | {
      readonly kind: "file";
      readonly text: string;
      readonly label: string;
      readonly ref: ProjectPathRef;
    };

const PATH_TOKEN_RE = new RegExp(PROJECT_PATH_TOKEN_SOURCE, "g");

/**
 * Splits user-prompt text into plain runs, `code` spans, and project-path
 * chips — the desktop bubble's inline chips without its markdown pipeline.
 * Path detection is the same `PROJECT_PATH_TOKEN_SOURCE` + `parseChatPathRef`
 * rule the desktop remark plugin applies to prose.
 */
export function tokenizeUserText(text: string, rootNames?: ReadonlySet<string>): UserTextSegment[] {
  const segments: UserTextSegment[] = [];
  const flush = (from: number, to: number) => {
    if (to > from) segments.push({ kind: "text", text: text.slice(from, to) });
  };
  let cursor = 0;
  let scan = 0;
  while (scan < text.length) {
    const tick = text.indexOf("`", scan);
    PATH_TOKEN_RE.lastIndex = scan;
    const path = PATH_TOKEN_RE.exec(text);
    const pathIndex = path ? path.index : Number.POSITIVE_INFINITY;
    if (tick === -1 && pathIndex === Number.POSITIVE_INFINITY) break;
    if (tick !== -1 && tick < pathIndex) {
      const close = text.indexOf("`", tick + 1);
      if (close === -1) {
        scan = tick + 1;
        continue;
      }
      flush(cursor, tick);
      if (close > tick + 1) {
        const span = text.slice(tick + 1, close);
        // A code span that is a project path chips like the desktop bubble;
        // the rule is chatMarkdown's codespan rule.
        const ref = parseProjectPathRef(span, { rootNames });
        const label = ref ? chatPathChipLabel(ref) : undefined;
        if (ref && label && !label.includes("`"))
          segments.push({ kind: "file", text: span, label, ref });
        else segments.push({ kind: "code", text: span });
      }
      cursor = close + 1;
      scan = cursor;
      continue;
    }
    const candidate = path![0];
    const ref = parseChatPathRef(candidate, rootNames);
    const label = ref ? chatPathChipLabel(ref) : undefined;
    if (!ref || !label || label.includes("`")) {
      // Not a chip: leave the candidate inside the pending text run.
      scan = pathIndex + candidate.length;
      continue;
    }
    flush(cursor, pathIndex);
    // Consume a trailing separator into the folder chip, as chatMarkdown does.
    let end = pathIndex + candidate.length;
    if (ref.kind === "folder" && /[\\/]/u.test(text[end] ?? "")) end += 1;
    segments.push({ kind: "file", text: text.slice(pathIndex, end), label, ref });
    cursor = end;
    scan = cursor;
  }
  flush(cursor, text.length);
  return segments;
}
