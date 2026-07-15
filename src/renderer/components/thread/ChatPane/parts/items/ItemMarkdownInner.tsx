import { Link } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ExternalLink } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Streamdown,
  defaultRehypePlugins,
  defaultUrlTransform,
  type Components as StreamdownComponents,
  type UrlTransform,
} from "streamdown";
import remarkGfm from "remark-gfm";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { toLocalFileUrl } from "@/shared/promptContent";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { normalizeChatProjectPath } from "../../chatPathUtils";
import { CodeBlock } from "./CodeBlock";
import { CopyTextButton } from "./CopyTextButton";
import { InlineFilePathChip } from "./InlineFilePathChip";
import { InlineFolderPathChip } from "./InlineFolderPathChip";
import { LC_SELECTOR_LANG, tryParseSelectorPayload } from "./SelectorBadge";
import { normalizeGfmTableSeparators, normalizeShortCodeFenceClosers } from "./ItemMarkdown";
import { chatInlineImageClass } from "./chatImageClass";
import { normalizeHighlightLanguage } from "./languageDetect";
import { parseProjectPathRef, type ProjectPathRef } from "./parseProjectPathRef";
import {
  AUTO_PATH_FILE_PREFIX,
  AUTO_PATH_FILE_HREF_PREFIX,
  AUTO_PATH_FOLDER_PREFIX,
  AUTO_PATH_FOLDER_HREF_PREFIX,
  remarkAutolinkProjectPaths,
} from "./remarkAutolinkProjectPaths";

type RemarkPlugins = NonNullable<ComponentProps<typeof Streamdown>["remarkPlugins"]>;
type RehypePlugins = NonNullable<ComponentProps<typeof Streamdown>["rehypePlugins"]>;

// Streamdown bundles `rehype-harden`, which rewrites links whose href fails its
// allowlist into `<span>…[blocked]</span>`. During streaming, partial hrefs
// (e.g. `https://sent`) routinely trip it, producing a "[blocked]" flash on
// otherwise valid URLs. We control external opens through `MdAnchor` and gate
// file/folder hrefs there too, so harden is redundant here.
const REHYPE_PLUGINS: RehypePlugins = Object.entries(defaultRehypePlugins)
  .filter(([key]) => key !== "harden")
  .flatMap(([key, plugin]) =>
    key === "sanitize" ? [rehypeLocalImageUrls, allowLocalImageProtocol(plugin)] : [plugin],
  );

interface ItemMarkdownInnerProps {
  text: string;
}

/**
 * Heavy markdown renderer (lazy-loaded). Uses Streamdown which handles
 * incomplete syntax during streaming (unclosed fences, half-formed links,
 * dangling bold/italic) and memoizes blocks internally so re-renders during
 * streaming only re-parse the trailing block.
 */
export default function ItemMarkdownInner({ text }: ItemMarkdownInnerProps) {
  const actions = useChatPaneActions();
  const rootNames = actions?.projectRootNames;
  // Escape the React Compiler: the plugin tuple captures `rootNames`, which
  // the compiler conservatively re-creates each render. Streaming chats
  // re-render on every chunk, so anchor the array to `rootNames` identity.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- intentional escape hatch
  const remarkPlugins = useMemo<RemarkPlugins>(
    () => [
      remarkGfm,
      [
        remarkAutolinkProjectPaths,
        {
          cacheKey: JSON.stringify({
            projectLocation: actions?.projectLocation ?? null,
            rootNames: rootNames ? [...rootNames].sort() : null,
          }),
          parsePathRef: (token: string) => {
            const ref = parseProjectPathRef(token, { rootNames });
            if (ref || !actions) return ref;
            const normalized = normalizeChatProjectPath(token, actions.projectLocation);
            return normalized === token ? null : parseProjectPathRef(normalized, { rootNames });
          },
        },
      ],
    ],
    [actions, rootNames],
  );
  const markdownText = normalizeIncompleteProjectLinkTail(
    normalizeGfmTableSeparators(normalizeShortCodeFenceClosers(text)),
  );
  return (
    <div className="lc-chat-markdown prose max-w-none text-[length:var(--lc-chat-font-size)] leading-snug text-foreground prose-headings:text-[length:var(--lc-chat-font-size)] prose-p:text-[length:var(--lc-chat-font-size)] prose-p:whitespace-pre-wrap prose-li:text-[length:var(--lc-chat-font-size)] prose-pre:my-2 prose-pre:rounded prose-pre:border-0 prose-pre:bg-foreground/10 prose-pre:px-[0.5em] prose-pre:py-[0.25em] prose-pre:font-mono prose-pre:text-[0.875em] prose-pre:leading-snug prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:overflow-x-hidden prose-code:before:content-none prose-code:after:content-none prose-a:text-foreground prose-a:no-underline prose-a:text-[length:inherit] hover:prose-a:underline hover:prose-a:decoration-1 prose-a:underline-offset-2">
      <Streamdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={REHYPE_PLUGINS}
        components={MD_COMPONENTS}
        urlTransform={transformMarkdownUrl}
        parseIncompleteMarkdown
      >
        {markdownText}
      </Streamdown>
    </div>
  );
}

const MD_COMPONENTS: StreamdownComponents = {
  pre({ children }) {
    const codeChild = findCodeChild(children);
    const codeProps = codeChild?.props as { className?: string; children?: ReactNode } | undefined;
    const rawLang = extractRawLangFromClassName(codeProps?.className);
    if (rawLang === LC_SELECTOR_LANG) {
      const text = flattenMdChildren(codeProps?.children).replace(/\r?\n$/, "");
      if (tryParseSelectorPayload(text)) return null;
    }
    if (codeChild) {
      const language = normalizeHighlightLanguage(codeProps?.className);
      if (language) {
        const text = flattenMdChildren(codeProps?.children).replace(/\r?\n$/, "");
        return (
          <MdCodeBlockFrame text={text}>
            <CodeBlock text={text} lang={language} className={markdownCodeBlockClass} />
          </MdCodeBlockFrame>
        );
      }
    }
    return (
      <MdCodeBlockFrame text={flattenMdChildren(children).replace(/\r?\n$/, "")}>
        <pre>{markCodeChildAsBlock(children)}</pre>
      </MdCodeBlockFrame>
    );
  },
  code({ className, children, ...rest }) {
    const isBlock =
      ("data-block" in rest && rest["data-block"] === "true") ||
      (typeof className === "string" && className.includes("language-"));
    return (
      <MdCode className={className ?? ""} isBlock={isBlock}>
        {children}
      </MdCode>
    );
  },
  a({ href, children }) {
    return <MdAnchor href={href ?? ""}>{children}</MdAnchor>;
  },
  img({ alt, className, ...rest }) {
    return (
      <img
        {...rest}
        alt={alt ?? ""}
        className={className ? `${markdownImageClass} ${className}` : markdownImageClass}
        decoding="async"
        draggable={false}
      />
    );
  },
  // Render a clean native table with HeroUI-themed styling. Override
  // Streamdown's default wrapper (which includes copy/download/fullscreen
  // controls) and replace its memoized sub-components with native HTML
  // elements so `<thead>`, `<tr>`, etc. compose correctly.
  table({ children }) {
    return (
      <div className="not-prose my-4 min-w-0 max-w-full overflow-x-auto rounded-2xl border border-border bg-[var(--surface-secondary)]/50">
        <table className="w-full border-collapse text-[length:var(--lc-chat-font-size)] leading-snug">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="[&_th]:border-b [&_th]:border-foreground/10">{children}</thead>;
  },
  tbody({ children }) {
    return (
      <tbody className="[&_tr:not(:last-child)_td]:border-b [&_tr:not(:last-child)_td]:border-foreground/5">
        {children}
      </tbody>
    );
  },
  tr({ children }) {
    return <tr>{children}</tr>;
  },
  th({ children }) {
    return <th className="px-4 py-1 text-left font-medium text-muted">{children}</th>;
  },
  td({ children }) {
    return <td className="px-4 py-1 align-middle text-foreground">{children}</td>;
  },
};

const inlineCodeChipClass =
  "rounded border-0 bg-foreground/10 px-[0.35em] py-[0.1em] font-mono text-[0.875em] leading-none align-baseline text-foreground [overflow-wrap:anywhere]";
const markdownCodeBlockClass =
  "not-prose my-2 min-w-0 overflow-x-hidden rounded bg-foreground/10 px-[0.5em] py-[0.25em] font-mono text-[0.875em] leading-snug text-foreground";
const markdownImageClass = `not-prose my-2 rounded-lg border border-[color:var(--border)] bg-[var(--composer-surface)] ${chatInlineImageClass}`;

const transformMarkdownUrl: UrlTransform = (url, key, node) =>
  key === "src" && node.tagName === "img" && url.startsWith("poracode-local://")
    ? url
    : defaultUrlTransform(url, key, node);

interface MarkdownHastNode {
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownHastNode[];
}

function rehypeLocalImageUrls() {
  return (tree: MarkdownHastNode) => {
    rewriteLocalImageUrls(tree);
  };
}

function rewriteLocalImageUrls(node: MarkdownHastNode): void {
  const src = node.properties?.src;
  if (node.tagName === "img" && typeof src === "string" && /^[A-Za-z]:[\\/]/.test(src)) {
    node.properties!.src = toLocalFileUrl(src);
  }
  node.children?.forEach(rewriteLocalImageUrls);
}

function allowLocalImageProtocol(plugin: RehypePlugins[number]): RehypePlugins[number] {
  if (!Array.isArray(plugin)) return plugin;
  const [transformer, rawSchema] = plugin;
  const schema = rawSchema as {
    protocols?: Record<string, readonly string[] | null | undefined>;
  };
  const protocols = schema.protocols ?? {};
  return [
    transformer,
    {
      ...schema,
      protocols: {
        ...protocols,
        src: [...(protocols.src ?? []), "poracode-local"],
      },
    },
  ] as RehypePlugins[number];
}

/**
 * Wraps a fenced code block with a copy button that reveals on hover of the
 * code block itself (`group/codeblock`). Kept outside `CodeBlock` so
 * command-output viewports (which reuse `CodeBlock`) are not affected.
 */
function MdCodeBlockFrame({ text, children }: { text: string; children?: ReactNode }) {
  const { t } = useLingui();
  if (text.length === 0) return <>{children}</>;
  return (
    <div className="group/codeblock relative">
      {children}
      <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover/codeblock:opacity-100">
        <CopyTextButton text={text} label={t`Copy code`} />
      </div>
    </div>
  );
}

function MdCode(props: { className: string; isBlock?: boolean; children?: ReactNode }) {
  const actions = useChatPaneActions();
  const isBlock =
    props.isBlock || (typeof props.className === "string" && props.className.includes("language-"));
  const text = flattenMdChildren(props.children).replace(/\n$/, "");
  if (isBlock) {
    return <code className={props.className || undefined}>{props.children}</code>;
  }
  if (actions) {
    const ref = parseProjectPathRef(text, { rootNames: actions.projectRootNames });
    if (ref) {
      return renderPathChip(ref, actions);
    }
  }
  return <code className={inlineCodeChipClass}>{props.children}</code>;
}

/**
 * Tag the fenced-block `<code>` child with `data-block` so the `code` override
 * can distinguish fenced blocks (no language) from inline code, which never
 * passes through a `<pre>`.
 */
function markCodeChildAsBlock(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child as ReactElement<Record<string, unknown>>, { "data-block": "true" });
  });
}

function extractRawLangFromClassName(className: string | undefined): string | null {
  if (!className) return null;
  for (const token of className.split(/\s+/)) {
    if (token.startsWith("language-")) return token.slice("language-".length).toLowerCase();
    if (token.startsWith("lang-")) return token.slice("lang-".length).toLowerCase();
  }
  return null;
}

function findCodeChild(children: ReactNode): ReactElement | null {
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const props = child.props as { className?: string; children?: ReactNode };
    if (child.type === "code" || typeof props.className === "string") {
      return child as ReactElement;
    }
    const nested = findCodeChild(props.children);
    if (nested) return nested;
  }
  return null;
}

function MdAnchor(props: { href: string; children?: ReactNode }) {
  const actions = useChatPaneActions();
  const href = props.href?.trim() ?? "";
  if (!href) return <span>{props.children}</span>;

  if (
    actions &&
    (href.startsWith(AUTO_PATH_FILE_PREFIX) || href.startsWith(AUTO_PATH_FILE_HREF_PREFIX))
  ) {
    const rest = decodeAutoPathHref(
      href.startsWith(AUTO_PATH_FILE_HREF_PREFIX)
        ? href.slice(AUTO_PATH_FILE_HREF_PREFIX.length)
        : href.slice(AUTO_PATH_FILE_PREFIX.length),
    );
    const lineMatch = rest.match(/^(.+):(\d+)(?:-(\d+))?$/);
    const path = lineMatch ? lineMatch[1]! : rest;
    const ref: ProjectPathRef = lineMatch
      ? {
          kind: "file",
          path,
          line: Number.parseInt(lineMatch[2]!, 10),
          ...(lineMatch[3] ? { endLine: Number.parseInt(lineMatch[3], 10) } : {}),
        }
      : { kind: "file", path };
    return renderPathChip(ref, actions);
  }
  if (
    actions &&
    (href.startsWith(AUTO_PATH_FOLDER_PREFIX) || href.startsWith(AUTO_PATH_FOLDER_HREF_PREFIX))
  ) {
    const path = decodeAutoPathHref(
      href.startsWith(AUTO_PATH_FOLDER_HREF_PREFIX)
        ? href.slice(AUTO_PATH_FOLDER_HREF_PREFIX.length)
        : href.slice(AUTO_PATH_FOLDER_PREFIX.length),
    );
    return renderPathChip({ kind: "folder", path }, actions);
  }

  if (/^(https?|mailto):/i.test(href)) {
    return (
      <Link
        href={href}
        rel="noreferrer noopener"
        className="text-[length:inherit] text-foreground no-underline hover:underline hover:decoration-1 underline-offset-2 [display:inline] [width:auto] [overflow-wrap:anywhere] [word-break:break-word]"
        onClick={(event) => {
          event.preventDefault();
          openExternalWithFeedback(href);
        }}
      >
        {props.children}
        <ExternalLink
          className="ml-[0.2em] inline-block size-[0.85em] align-[-0.1em]"
          aria-hidden
        />
      </Link>
    );
  }
  if (actions) {
    const ref = parseHrefProjectPathRef(href, actions);
    if (ref?.kind === "folder") {
      const folderPath = normalizeChatProjectPath(ref.path, actions.projectLocation);
      return (
        <button
          type="button"
          className="inline cursor-pointer rounded border-0 bg-foreground/10 px-[0.35em] py-[0.1em] font-mono text-[0.875em] leading-none align-baseline text-accent underline-offset-2 [overflow-wrap:anywhere] hover:bg-foreground/15 hover:underline"
          onClick={() => actions.revealProjectFolderInTree(folderPath)}
        >
          {props.children}
        </button>
      );
    }
    if (ref?.kind === "file") {
      return (
        <button
          type="button"
          className="inline cursor-pointer rounded border-0 bg-foreground/10 px-[0.35em] py-[0.1em] font-mono text-[0.875em] leading-none align-baseline text-accent underline-offset-2 [overflow-wrap:anywhere] hover:bg-foreground/15 hover:underline"
          onClick={() =>
            actions.openProjectRelativePath(
              normalizeChatProjectPath(ref.path, actions.projectLocation),
              ref.line,
            )
          }
        >
          {props.children}
        </button>
      );
    }
  }
  if (href.startsWith("/") || href.startsWith("file:")) {
    return <span>{props.children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {props.children}
    </a>
  );
}

function decodeAutoPathHref(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function normalizeIncompleteProjectLinkTail(text: string): string {
  return text.replace(/\[([^\]\n]+)\]\((?:\/|file:[^\s)]*)?$/u, "$1");
}

function parseHrefProjectPathRef(
  href: string,
  actions: NonNullable<ReturnType<typeof useChatPaneActions>>,
): ProjectPathRef | null {
  const rootNames = actions.projectRootNames;
  const direct = parseProjectPathRef(href, { rootNames });
  if (direct) return direct;

  const normalized = normalizeChatProjectPath(href, actions.projectLocation);
  if (normalized === href) return null;
  return parseProjectPathRef(normalized, { rootNames });
}

function renderPathChip(
  ref: ProjectPathRef,
  actions: NonNullable<ReturnType<typeof useChatPaneActions>>,
) {
  const normalized = normalizeChatProjectPath(ref.path, actions.projectLocation);
  if (ref.kind === "file") {
    return (
      <InlineFilePathChip
        path={normalized}
        line={ref.line}
        endLine={ref.endLine}
        onOpen={actions.openProjectRelativePath}
      />
    );
  }
  return (
    <InlineFolderPathChip
      path={normalized}
      onRevealInTree={actions.revealProjectFolderInTree}
      onShowInExplorer={actions.showProjectEntryInExplorer}
    />
  );
}

function flattenMdChildren(node: ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenMdChildren).join("");
  if (isValidElement(node)) {
    const p = node.props as { children?: ReactNode };
    return flattenMdChildren(p.children);
  }
  return "";
}
