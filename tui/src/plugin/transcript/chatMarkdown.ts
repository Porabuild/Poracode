import { lexer } from "marked";
import {
  PROJECT_PATH_TOKEN_SOURCE,
  fallbackChatLinkLabel,
  parseChatPathRef,
  parsePathRefUrl,
  parseProjectPathRef,
  type ProjectPathRef,
} from "../../desktop/presentation";

export interface ChatMarkdownOptions {
  /** The session's project directory; absolute link paths under it count as project paths. */
  readonly root?: string | undefined;
  /** Top-level entry names of the project; folders need them to chip in prose. */
  readonly rootNames?: ReadonlySet<string> | undefined;
}

interface AnyToken {
  readonly type: string;
  readonly raw: string;
  readonly text?: string;
  readonly href?: string;
  readonly tokens?: AnyToken[];
  readonly items?: { readonly tokens?: AnyToken[] }[];
  readonly header?: { readonly tokens?: AnyToken[] }[];
  readonly rows?: { readonly tokens?: AnyToken[] }[][];
}

interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const PATH_TOKEN_RE = new RegExp(PROJECT_PATH_TOKEN_SOURCE, "g");
const SKIP_DESCENT = new Set(["code", "html", "escape", "br", "image", "hr"]);
// Anything the rewriter can touch: a path token, a link scheme it relabels or
// resolves, or markdown link syntax whose destination may be a project path.
const REWRITE_CANDIDATE_RE = /(?:https?:|mailto:|poracode:|\]\()/iu;

/**
 * Rewrites assistant markdown the way the desktop chat presents it: project
 * paths become code-span chips and bare links get the desktop's fallback
 * labels, so the TUI's conceal/render pipeline shows chips instead of raw
 * syntax. Returns the source unchanged whenever the token stream cannot be
 * mapped back onto it (partial streaming input, unbalanced raws).
 */
export function chatMarkdown(source: string, options: ChatMarkdownOptions = {}): string {
  const text = source.replace(/\r\n?/g, "\n");
  PATH_TOKEN_RE.lastIndex = 0;
  if (!PATH_TOKEN_RE.test(text) && !REWRITE_CANDIDATE_RE.test(text)) return text;
  const tokens = lexer(text, { gfm: true }) as unknown as AnyToken[];
  // Top-level raws must reconstruct the normalized source exactly.
  if (tokens.map((token) => token.raw).join("") !== text) return text;
  return tokens.map((token) => rewriteBlock(token, options)).join("");
}

function rewriteBlock(token: AnyToken, options: ChatMarkdownOptions): string {
  if (token.type === "code" || token.type === "html") return token.raw;
  const replacements: Replacement[] = [];
  let cursor = 0;
  let aborted = false;

  const locate = (raw: string): number => {
    const at = token.raw.indexOf(raw, cursor);
    if (at < 0) {
      aborted = true;
      return -1;
    }
    cursor = at + raw.length;
    return at;
  };

  const leaf = (value: AnyToken) => {
    if (aborted) return;
    const at = locate(value.raw);
    if (at < 0) return;
    const replacement =
      value.type === "codespan"
        ? codeSpanReplacement(value.text ?? "", options)
        : value.type === "link"
          ? linkReplacement(value, options)
          : value.type === "text"
            ? null
            : undefined;
    if (replacement !== undefined && replacement !== null)
      replacements.push({ start: at, end: at + value.raw.length, text: replacement });
    else if (value.type === "text") textReplacements(value, at, options, replacements);
  };

  const visit = (value: AnyToken) => {
    if (aborted) return;
    if (SKIP_DESCENT.has(value.type) || value.type === "codespan" || value.type === "link") {
      leaf(value);
      return;
    }
    // Containers descend first: a `text` token can carry inline `tokens`
    // (marked wraps list-item and formatted text that way), and only a
    // childless `text` token is a leaf whose raw the path regex may scan.
    if (value.tokens) {
      for (const child of value.tokens) visit(child);
      return;
    }
    if (value.items) {
      for (const item of value.items) for (const child of item.tokens ?? []) visit(child);
      return;
    }
    if (value.header || value.rows) {
      for (const cell of value.header ?? []) for (const child of cell.tokens ?? []) visit(child);
      for (const row of value.rows ?? [])
        for (const cell of row) for (const child of cell.tokens ?? []) visit(child);
      return;
    }
    if (value.type === "text") {
      leaf(value);
      return;
    }
    // Unknown leaf: nothing to rewrite and nothing to descend into.
  };

  if (token.tokens) for (const child of token.tokens) visit(child);
  else if (token.items)
    for (const item of token.items) for (const child of item.tokens ?? []) visit(child);
  else if (token.header || token.rows) {
    for (const cell of token.header ?? []) for (const child of cell.tokens ?? []) visit(child);
    for (const row of token.rows ?? [])
      for (const cell of row) for (const child of cell.tokens ?? []) visit(child);
  } else if (token.type === "text") visit(token);

  // Apply right-to-left so earlier offsets stay valid.
  let rewritten = token.raw;
  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    rewritten =
      rewritten.slice(0, replacement.start) + replacement.text + rewritten.slice(replacement.end);
  return rewritten;
}

function codeSpanReplacement(text: string, options: ChatMarkdownOptions): string | undefined {
  const ref = parseProjectPathRef(text, { rootNames: options.rootNames });
  if (!ref) return undefined;
  const label = chatPathChipLabel(ref);
  return label && !label.includes("`") ? `\`${label}\`` : undefined;
}

function linkReplacement(token: AnyToken, options: ChatMarkdownOptions): string | undefined {
  const href = token.href?.trim();
  if (!href) return undefined;
  const explicit = parsePathRefUrl(href);
  if (explicit) {
    const label = chatPathChipLabel(explicit);
    return label && !label.includes("`") ? `\`${label}\`` : undefined;
  }
  const candidate = linkPathCandidate(href, options.root);
  if (candidate !== undefined) {
    const ref = parseChatPathRef(candidate, options.rootNames);
    if (ref) {
      const label = chatPathChipLabel(ref);
      if (label && !label.includes("`")) return `\`${label}\``;
    }
  }
  // Bare GFM autolinks, `<url>`, and `[url](url)` relabel like the desktop.
  if (/^(?:https?:|mailto:)/iu.test(href) && (token.text ?? "").trim() === href) {
    const label = fallbackChatLinkLabel(href).replace(/[\\[\]]/gu, "\\$&");
    return `[${label}](${href})`;
  }
  return undefined;
}

/** The link destination as a project-relative path, or undefined when it is not one. */
function linkPathCandidate(href: string, root: string | undefined): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(href) || href.startsWith("//")) return undefined;
  let path = href;
  if (root) {
    const base = root.replace(/[\\/]+$/u, "");
    if (path.startsWith(`${base}/`) || path.startsWith(`${base}\\`))
      path = path.slice(base.length + 1);
  }
  if (/^(?:\/|[a-z]:[\\/]|\\\\)/iu.test(path)) return undefined;
  return path;
}

function textReplacements(
  token: AnyToken,
  at: number,
  options: ChatMarkdownOptions,
  replacements: Replacement[],
) {
  // token.text is the decoded text; positions only map onto raw when they match.
  if (token.text !== undefined && token.text !== token.raw) return;
  PATH_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_TOKEN_RE.exec(token.raw)) !== null) {
    const ref = parseChatPathRef(match[0], options.rootNames);
    if (!ref) continue;
    const label = chatPathChipLabel(ref);
    if (!label || label.includes("`")) continue;
    // The token pattern stops before a trailing separator; a folder chip
    // already carries "/", so consume it instead of leaving `lib/`/ behind.
    let end = match.index + match[0].length;
    if (ref.kind === "folder" && /[\\/]/u.test(token.raw[end] ?? "")) end += 1;
    replacements.push({
      start: at + match.index,
      end: at + end,
      text: `\`${label}\``,
    });
  }
}

/** The desktop InlineFilePathChip label: basename plus `· L12` / `· L12-20`, folders with `/`. */
export function chatPathChipLabel(ref: ProjectPathRef): string | undefined {
  const base = ref.path
    .split(/[\\/]/u)
    .filter((segment) => segment.length > 0 && segment !== ".")
    .at(-1);
  if (!base) return undefined;
  if (ref.kind === "folder") return `${base}/`;
  const lines =
    ref.line !== undefined
      ? ` · L${ref.line}${ref.endLine !== undefined ? `-${ref.endLine}` : ""}`
      : "";
  return `${base}${lines}`;
}
