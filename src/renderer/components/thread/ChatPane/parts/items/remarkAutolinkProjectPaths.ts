import { PROJECT_PATH_TOKEN_SOURCE, type ProjectPathRef } from "./parseProjectPathRef";
import { pathRefUrl } from "./markdownPathRefs";

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

const PATH_TOKEN_RE = new RegExp(PROJECT_PATH_TOKEN_SOURCE, "g");

/**
 * Markdown plugin that auto-links plain-text path tokens (e.g.
 * `foo.ts:42`, `src/foo/bar.ts`, `src/lib/`) to chip-rendered links when
 * `parsePathRef` confirms they are path-shaped. Bare filenames resolve through
 * the project file index when clicked. Tokens that fail validation are left as
 * plain text, so unrelated words, `@scope/name` package references, and
 * arbitrary slashed strings don't become chips.
 *
 * Detection skips text inside code spans, fenced blocks, and existing links.
 */
export function remarkAutolinkProjectPaths(options: PluginOptions) {
  return (tree: MdNode) => visit(tree, options);
}

function visit(node: MdNode, options: PluginOptions): void {
  if (!node.children) return;
  // Preserve the recursive visitor's DFS order and delayed parent replacement
  // without consuming the JS stack for deeply nested inline formatting.
  const pending = [{ node, children: node.children, index: 0, next: [] as MdNode[] }];
  while (pending.length > 0) {
    const frame = pending[pending.length - 1]!;
    if (frame.index >= frame.children.length) {
      frame.node.children = frame.next;
      pending.pop();
      pending[pending.length - 1]?.next.push(frame.node);
      continue;
    }
    const child = frame.children[frame.index++]!;
    if (child.type === "text" && typeof child.value === "string") {
      frame.next.push(...transformText(child.value, options));
    } else if (child.type === "link" && typeof child.url === "string") {
      // These destinations already carry URL identity. Filesystem normalization
      // can collapse `https://` to `https:/` and misclassify an explicit file link
      // as a folder while the project's root-name index is still unavailable.
      if (!/^(?:https?:\/\/|poracode:)/i.test(child.url)) {
        const ref = options.parsePathRef(child.url);
        if (ref) child.url = pathRefUrl(ref);
      }
      frame.next.push(child);
    } else if (SKIP_PARENT_TYPES.has(child.type)) {
      frame.next.push(child);
    } else if (child.children) {
      pending.push({ node: child, children: child.children, index: 0, next: [] });
    } else {
      frame.next.push(child);
    }
  }
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
