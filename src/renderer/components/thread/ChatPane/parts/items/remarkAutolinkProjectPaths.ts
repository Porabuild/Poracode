import type { ProjectPathRef } from "./parseProjectPathRef";

/**
 * Sentinel URL prefixes used to mark links injected by `remarkAutolinkProjectPaths`,
 * so the markdown anchor renderer can route them to file/folder chip components
 * instead of treating them as user-authored markdown links.
 */
export const AUTO_PATH_FILE_PREFIX = "poracode:path:";
export const AUTO_PATH_FOLDER_PREFIX = "poracode:folder:";
export const AUTO_PATH_FILE_HREF_PREFIX = "https://poracode.local/path/";
export const AUTO_PATH_FOLDER_HREF_PREFIX = "https://poracode.local/folder/";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

interface PluginOptions {
  cacheKey?: string;
  parsePathRef: (token: string) => ProjectPathRef | null;
}

const SKIP_PARENT_TYPES = new Set(["code", "inlineCode", "link", "linkReference", "html"]);

const PATH_TOKEN_RE =
  /(?<![A-Za-z0-9_:/@.\\-])(\/?[A-Za-z0-9_@.][A-Za-z0-9_@.-]*(?:[\\/][A-Za-z0-9_@.-]+)+)(?::(\d+)(?:-\d+)?)?/g;

/**
 * Markdown plugin that auto-links plain-text path tokens (e.g.
 * `src/foo/bar.ts`, `src/foo/bar.ts:42`, `src/lib/`) to chip-rendered links
 * when `parsePathRef` confirms they refer to a real project path. Tokens that
 * fail validation are left as plain text, so unrelated `@scope/name` package
 * references and arbitrary slashed strings don't become chips.
 *
 * Detection skips text inside code spans, fenced blocks, and existing links.
 */
export function remarkAutolinkProjectPaths(options: PluginOptions) {
  return (tree: MdNode) => visit(tree, options);
}

function visit(node: MdNode, options: PluginOptions): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...transformText(child.value, options));
    } else if (child.type === "link" && typeof child.url === "string") {
      const ref = options.parsePathRef(child.url);
      if (ref) child.url = pathRefUrl(ref);
      next.push(child);
    } else if (SKIP_PARENT_TYPES.has(child.type)) {
      next.push(child);
    } else {
      visit(child, options);
      next.push(child);
    }
  }
  node.children = next;
}

function transformText(text: string, options: PluginOptions): MdNode[] {
  PATH_TOKEN_RE.lastIndex = 0;
  const out: MdNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_TOKEN_RE.exec(text)) !== null) {
    const fullMatch = match[0];
    const ref = options.parsePathRef(fullMatch);
    if (!ref) continue;

    if (match.index > cursor) {
      out.push({ type: "text", value: text.slice(cursor, match.index) });
    }
    out.push({
      type: "link",
      url: pathRefUrl(ref),
      children: [{ type: "text", value: fullMatch }],
    });
    cursor = match.index + fullMatch.length;
  }
  if (cursor === 0) return [{ type: "text", value: text }];
  if (cursor < text.length) {
    out.push({ type: "text", value: text.slice(cursor) });
  }
  return out;
}

function pathRefUrl(ref: ProjectPathRef): string {
  const target =
    ref.kind === "file"
      ? `${ref.path}${
          ref.line !== undefined
            ? `:${ref.line}${ref.endLine !== undefined ? `-${ref.endLine}` : ""}`
            : ""
        }`
      : ref.path;
  return ref.kind === "file"
    ? `${AUTO_PATH_FILE_HREF_PREFIX}${encodeURIComponent(target)}`
    : `${AUTO_PATH_FOLDER_HREF_PREFIX}${encodeURIComponent(target)}`;
}
