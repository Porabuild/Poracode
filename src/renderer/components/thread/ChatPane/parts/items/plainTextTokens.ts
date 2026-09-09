import { parsePathRefUrl } from "./markdownPathRefs";
import {
  parseProjectPathRef,
  PROJECT_PATH_TOKEN_SOURCE,
  type ProjectPathRef,
} from "./parseProjectPathRef";

type PlainTextNode =
  | { kind: "text"; value: string }
  | { kind: "url"; href: string }
  | ProjectPathRef;

// Consume the entire explicit path link before ordinary URL/path detection.
// This keeps the lazy renderer's fallback from exposing internal hrefs or
// splitting filenames with spaces into unrelated path chips.
const MARKDOWN_PATH_LINK_SOURCE = String.raw`\[(?:\\.|[^\]\\\r\n])*\]\((https://poracode\.local/(?:path|folder)/[^\s)]+)\)`;

export function tokenizePlainText(
  text: string,
  rootNames: ReadonlySet<string> | undefined,
): PlainTextNode[] {
  const tokens = new RegExp(
    `${MARKDOWN_PATH_LINK_SOURCE}|https?:\\/\\/[^\\s<>"']+|${PROJECT_PATH_TOKEN_SOURCE}`,
    "g",
  );
  const out: PlainTextNode[] = [];
  let cursor = 0;
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    let node: PlainTextNode | null;
    let end = match.index + match[0].length;
    if (match[1]) {
      node = parsePathRefUrl(match[1]);
    } else if (/^https?:\/\//i.test(match[0])) {
      const href = match[0].replace(/[),.;:!?]+$/, "");
      if (!href) continue;
      node = parsePathRefUrl(href) ?? { kind: "url", href };
      end = match.index + href.length;
    } else {
      node = parseProjectPathRef(match[0], { rootNames });
    }
    if (!node) continue;
    if (match.index > cursor) out.push({ kind: "text", value: text.slice(cursor, match.index) });
    out.push(node);
    cursor = end;
    tokens.lastIndex = cursor;
  }
  if (cursor === 0) return [{ kind: "text", value: text }];
  if (cursor < text.length) out.push({ kind: "text", value: text.slice(cursor) });
  return out;
}
