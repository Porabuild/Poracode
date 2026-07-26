import { Link } from "@heroui/react";
import { Suspense, useDeferredValue, useMemo } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { useSmoothStreamedText } from "@/renderer/hooks/useSmoothStreamedText";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { normalizeChatProjectPath } from "../../chatPathUtils";
import { InlineFilePathChip } from "./InlineFilePathChip";
import { InlineFolderPathChip } from "./InlineFolderPathChip";
import { parseProjectPathRef, PROJECT_PATH_TOKEN_SOURCE } from "./parseProjectPathRef";
import { DeferredItemMarkdownInner } from "@/renderer/deferredFeatures";

interface ItemMarkdownProps {
  text: string;
}

interface SmoothItemMarkdownProps extends ItemMarkdownProps {
  isStreaming: boolean;
}

export function SmoothItemMarkdown({ text, isStreaming }: SmoothItemMarkdownProps) {
  const smoothedText = useSmoothStreamedText(text, isStreaming);
  const deferredText = useDeferredValue(smoothedText);
  return <ItemMarkdown text={isStreaming ? deferredText : text} />;
}

/**
 * Compact markdown renderer used by every chat row (assistant, user,
 * reasoning). The heavy renderer (Streamdown + remark plugins) is lazy-loaded
 * so it doesn't block app startup; until the chunk arrives we fall back to a
 * plain-text view that still chips URLs and project paths so the first paint
 * is never blank.
 */
export function ItemMarkdown({ text }: ItemMarkdownProps) {
  const actions = useChatPaneActions();
  const rootNames = actions?.projectRootNames;
  return (
    <Suspense
      fallback={
        <PlainText text={text} rootNames={rootNames} projectLocation={actions?.projectLocation} />
      }
    >
      <DeferredItemMarkdownInner text={text} />
    </Suspense>
  );
}

function PlainText({
  text,
  rootNames,
  projectLocation,
}: {
  text: string;
  rootNames: ReadonlySet<string> | undefined;
  projectLocation: ProjectLocation | undefined;
}) {
  const actions = useChatPaneActions();
  // Re-tokenizing on every render dominates the plain-text path during
  // streaming (regex scan over the full message body for each delta).
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- intentional escape hatch
  const nodes = useMemo(() => tokenizePlainText(text, rootNames), [text, rootNames]);
  const toRelative = (path: string) =>
    projectLocation ? normalizeChatProjectPath(path, projectLocation) : path;
  return (
    <div className="whitespace-pre-wrap break-words text-[length:var(--lc-chat-font-size)] leading-snug text-foreground">
      {nodes.map((node, i) => {
        if (node.kind === "text") return <span key={i}>{node.value}</span>;
        if (node.kind === "url") {
          return (
            <Link
              key={i}
              href={node.href}
              rel="noreferrer noopener"
              className="[display:inline] [width:auto] [overflow-wrap:anywhere] [word-break:break-word]"
              onClick={(event) => {
                event.preventDefault();
                openExternalWithFeedback(node.href);
              }}
            >
              {node.href}
            </Link>
          );
        }
        if (node.kind === "file") {
          return (
            <InlineFilePathChip
              key={i}
              path={toRelative(node.path)}
              line={node.line}
              endLine={node.endLine}
              onOpen={actions?.openProjectRelativePath}
            />
          );
        }
        return (
          <InlineFolderPathChip
            key={i}
            path={toRelative(node.path)}
            onRevealInTree={actions?.revealProjectFolderInTree}
            onShowInExplorer={actions?.showProjectEntryInExplorer}
          />
        );
      })}
    </div>
  );
}

type PlainTextNode =
  | { kind: "text"; value: string }
  | { kind: "url"; href: string }
  | { kind: "file"; path: string; line?: number; endLine?: number }
  | { kind: "folder"; path: string };

const PLAIN_TOKEN_RE = new RegExp(`https?:\\/\\/[^\\s<>"']+|${PROJECT_PATH_TOKEN_SOURCE}`, "g");

function tokenizePlainText(
  text: string,
  rootNames: ReadonlySet<string> | undefined,
): PlainTextNode[] {
  PLAIN_TOKEN_RE.lastIndex = 0;
  const out: PlainTextNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = PLAIN_TOKEN_RE.exec(text)) !== null) {
    if (/^https?:\/\//i.test(match[0])) {
      const href = trimTrailingUrlPunctuation(match[0]);
      if (href.length === 0) continue;
      if (match.index > cursor) {
        out.push({ kind: "text", value: text.slice(cursor, match.index) });
      }
      out.push({ kind: "url", href });
      cursor = match.index + href.length;
      PLAIN_TOKEN_RE.lastIndex = cursor;
      continue;
    }

    const ref = parseProjectPathRef(match[0], { rootNames });
    if (!ref) continue;
    if (match.index > cursor) {
      out.push({ kind: "text", value: text.slice(cursor, match.index) });
    }
    if (ref.kind === "file") {
      out.push(
        ref.line !== undefined
          ? {
              kind: "file",
              path: ref.path,
              line: ref.line,
              ...(ref.endLine !== undefined ? { endLine: ref.endLine } : {}),
            }
          : { kind: "file", path: ref.path },
      );
    } else {
      out.push({ kind: "folder", path: ref.path });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor === 0) return [{ kind: "text", value: text }];
  if (cursor < text.length) out.push({ kind: "text", value: text.slice(cursor) });
  return out;
}

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[),.;:!?]+$/, "");
}

/**
 * remark-gfm only recognizes a markdown table when the separator row's cell
 * count exactly matches the header row's cell count. If the model emits a
 * mismatched separator (e.g. `|---|---|---|` under a 4-cell header), the entire
 * block is rejected and rendered as raw piped text — the failure mode users
 * report as a "corrupted table". Rewrite the separator to match the header
 * before handing the text to Streamdown so the table renders.
 */
export function normalizeGfmTableSeparators(text: string): string {
  const lineParts = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g);
  if (!lineParts) return text;
  let inFence = false;
  let changed = false;
  for (let i = 0; i < lineParts.length - 1; i++) {
    const line = lineParts[i];
    if (line === undefined) continue;
    const newlineMatch = line.match(/(\r\n|\n|\r)$/);
    const body = newlineMatch ? line.slice(0, -newlineMatch[0].length) : line;
    if (/^ {0,3}```/.test(body)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const nextLine = lineParts[i + 1];
    if (nextLine === undefined) continue;
    const nextNewlineMatch = nextLine.match(/(\r\n|\n|\r)$/);
    const nextBody = nextNewlineMatch ? nextLine.slice(0, -nextNewlineMatch[0].length) : nextLine;
    if (!isPotentialTableRow(body)) continue;
    if (!isTableSeparatorRow(nextBody)) continue;
    const headerCells = splitTableCells(body);
    const sepCells = splitTableCells(nextBody);
    if (headerCells.length === 0) continue;
    if (headerCells.length === sepCells.length) continue;
    const rebuilt = buildSeparatorRow(headerCells.length, sepCells);
    lineParts[i + 1] = rebuilt + (nextNewlineMatch?.[0] ?? "");
    changed = true;
  }
  return changed ? lineParts.join("") : text;
}

function isPotentialTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return /[^\s|:-]/.test(trimmed);
}

function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(trimmed);
}

function splitTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|");
}

function buildSeparatorRow(cellCount: number, sourceCells: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < cellCount; i++) {
    const src = (sourceCells[i] ?? "").trim();
    let cell = "---";
    if (/^:-+:$/.test(src)) cell = ":---:";
    else if (/^:-+$/.test(src)) cell = ":---";
    else if (/^-+:$/.test(src)) cell = "---:";
    parts.push(cell);
  }
  return `| ${parts.join(" | ")} |`;
}

export function normalizeShortCodeFenceClosers(text: string): string {
  let inBacktickFence = false;
  let changed = false;
  const out = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.map((line) => {
    if (line.length === 0) return line;
    const newlineMatch = line.match(/(\r\n|\n|\r)$/);
    const newline = newlineMatch?.[0] ?? "";
    const body = newline ? line.slice(0, -newline.length) : line;
    if (!inBacktickFence) {
      if (/^ {0,3}```[^`]*$/.test(body)) inBacktickFence = true;
      return line;
    }
    if (/^ {0,3}```+\s*$/.test(body)) {
      inBacktickFence = false;
      return line;
    }
    const shortCloserMatch = body.match(/^( {0,3})``\s*$/);
    if (!shortCloserMatch) return line;
    inBacktickFence = false;
    changed = true;
    return `${shortCloserMatch[1]}\`\`\`${newline}`;
  });
  return changed ? (out ?? []).join("") : text;
}
