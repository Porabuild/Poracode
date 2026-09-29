import { Link } from "@heroui/react";
import { Suspense, useMemo } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { useSmoothStreamedText } from "@/renderer/hooks/useSmoothStreamedText";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { normalizeChatProjectPath } from "../../chatPathUtils";
import { InlineFilePathChip } from "./InlineFilePathChip";
import { InlineFolderPathChip } from "./InlineFolderPathChip";
import { tokenizePlainText } from "./plainTextTokens";
import { DeferredItemMarkdownInner } from "@/renderer/deferredFeatures";

interface ItemMarkdownProps {
  text: string;
  plainText?: boolean;
}

interface SmoothItemMarkdownProps extends ItemMarkdownProps {
  isStreaming: boolean;
}

export function SmoothItemMarkdown({ text, isStreaming }: SmoothItemMarkdownProps) {
  const chunkedPlainText = shouldUseChunkedPlainText(text);
  // Long plain output is still readable as it arrives; limiting DOM updates
  // avoids repeatedly re-laying out an ever-growing paragraph every frame.
  const smoothedText = useSmoothStreamedText(text, isStreaming, chunkedPlainText ? 1_000 : 0);
  const displayedText = isStreaming ? smoothedText : text;
  return <ItemMarkdown text={displayedText} plainText={chunkedPlainText} />;
}

/**
 * Streamdown reparses its trailing block on each reveal frame. A long plain
 * line is one block, so its parsing cost grows throughout a turn. Its single
 * changing DOM text node also makes Chromium retain large native text-layout
 * allocations. Use stable small spans for genuinely unformatted content,
 * including after completion. Keep the gate conservative so links, file paths,
 * code, math, and other formatting retain full Markdown rendering.
 */
export function shouldUseChunkedPlainText(text: string): boolean {
  return (
    text.length >= 8_192 &&
    !/[\r\n`*_~$\\<>#|/&@.]/u.test(text) &&
    !text.includes("](") &&
    !text.includes("![")
  );
}

const PLAIN_TEXT_CHUNK_SIZE = 4_096;

/** Preserve the exact text while freezing each complete span on append. */
export function splitStreamingPlainText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start + PLAIN_TEXT_CHUNK_SIZE < text.length) {
    const hardEnd = start + PLAIN_TEXT_CHUNK_SIZE;
    const space = text.lastIndexOf(" ", hardEnd);
    let end = space >= start + PLAIN_TEXT_CHUNK_SIZE / 2 ? space + 1 : hardEnd;
    // Do not put the two halves of an astral code point in different nodes.
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  chunks.push(text.slice(start));
  return chunks;
}

function ChunkedPlainText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-[length:var(--lc-chat-font-size)] leading-snug text-foreground">
      {splitStreamingPlainText(text).map((chunk, index) => (
        <span key={index}>{chunk}</span>
      ))}
    </div>
  );
}

/**
 * Compact markdown renderer used by every chat row (assistant, user,
 * reasoning). The heavy renderer (Streamdown + remark plugins) is lazy-loaded
 * so it doesn't block app startup; until the chunk arrives we fall back to a
 * plain-text view that still chips URLs and project paths so the first paint
 * is never blank.
 */
export function ItemMarkdown({ text, plainText = false }: ItemMarkdownProps) {
  const actions = useChatPaneActions();
  const rootNames = actions?.projectRootNames;
  if (plainText) {
    return <ChunkedPlainText text={text} />;
  }
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
  const formatTranscript = actions?.formatTranscriptMarkdown;
  const nodes = useMemo(
    () => tokenizePlainText(formatTranscript ? formatTranscript(text) : text, rootNames),
    [text, rootNames, formatTranscript],
  );
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
