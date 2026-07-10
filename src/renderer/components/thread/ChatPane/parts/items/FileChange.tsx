import { memo, useState, type ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { CircleAlert, FileEdit } from "lucide-react";
import type { FileChangePayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatFilePath } from "./ChatFilePath";
import { ChatItemAccordion } from "./ChatItemAccordion";
import { CommandOutputViewport } from "./CommandOutputViewport";
import { ToolCallSections, type ToolCallSection } from "./ToolCallSections";
import {
  extractAcpAddedFileText,
  extractAcpArgsPart,
  extractAcpDiffResultPart,
  extractAcpResultPart,
  readAcpContentEditTexts,
  type DiffSummary,
  type ExtractedPart,
} from "./acpToolPayload";
import { getFileChangeCollapsedHeader } from "./collapsedHeaderCache";
import { LazyInlineDiffView } from "./LazyInlineDiffView";
import { detectLanguageFromPath } from "./languageDetect";
import { FileContentPlaceholder, useReadAbsoluteFile } from "./useReadAbsoluteFile";

interface FileChangeProps {
  item: RuntimeChatItem;
}

export const FileChange = memo(function FileChange({ item }: FileChangeProps) {
  const { t } = useLingui();
  const payload = getRuntimeItemPayload<FileChangePayload>(item, "file_change");
  const [isExpanded, setIsExpanded] = useState(false);
  const stream = item.streams.file_change_output;
  const hasStream = !!stream && stream.length > 0;
  const header = payload ? getFileChangeCollapsedHeader(item, payload) : null;
  const paneActions = useChatPaneActions();

  // Some SDKs (e.g. Claude `Write`) don't surface the new file contents on
  // `args.content`; fall back to an on-demand disk read when expanded.
  const fetchTarget =
    header &&
    header.changeKind === "create" &&
    !header.hasArgContent &&
    !header.hasDiffText &&
    header.hasPath &&
    paneActions?.projectLocation
      ? { path: header.path, projectLocation: paneActions.projectLocation }
      : null;
  const fetched = useReadAbsoluteFile(isExpanded ? fetchTarget : null);

  if (!payload || !header) return null;

  // Body-only extraction — collapsed remounts only need the cached header.
  const argContent = isExpanded && header.hasArgContent ? extractCreateContent(payload) : undefined;
  const diffText =
    isExpanded && header.hasDiffText ? extractAcpDiffResultPart(payload)?.text : undefined;
  const contentEdit = isExpanded ? readAcpContentEditTexts(payload) : undefined;
  const sections: ToolCallSection[] =
    isExpanded &&
    !hasStream &&
    !header.hasArgContent &&
    !header.hasDiffText &&
    fetched.content === undefined
      ? [
          { label: "args", part: enrichLanguage(extractAcpArgsPart(payload), payload.path) },
          { label: "result", part: extractAcpResultPart(payload) },
        ]
      : [];
  const hasDetails =
    hasStream ||
    header.hasArgContent ||
    header.hasDiffText ||
    fetchTarget !== null ||
    header.hasAuxFields;
  const right = formatRightLabel(header.payloadStatus, header.diffSummary, t);
  const titleNode = (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span className="shrink-0 !text-[color:var(--muted)]">
        {localizeKindLabel(header.changeKind, header.withPath, t)}
      </span>
      {header.hasPath ? (
        <ChatFilePath
          className="flex-1"
          path={header.path}
          basenameClassName="!text-[color:var(--foreground)]"
          dirClassName="!text-[color:var(--muted)]"
        />
      ) : header.showsFallback && header.fallbackTitle ? (
        <span className="min-w-0 truncate !text-[color:var(--muted)]">{header.fallbackTitle}</span>
      ) : null}
    </span>
  );
  const language = detectLanguageFromPath(payload.path);

  return (
    <ChatItemAccordion
      icon={<FileEdit className="size-3" />}
      title={titleNode}
      rightLabel={right}
      hasBody={hasDetails}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {diffText !== undefined ? (
        <LazyInlineDiffView
          diffText={diffText}
          filePath={payload.path}
          {...(contentEdit ? { oldText: contentEdit.oldText, newText: contentEdit.newText } : {})}
        />
      ) : argContent !== undefined ? (
        <CommandOutputViewport text={argContent} language={language} />
      ) : fetched.content !== undefined ? (
        <CommandOutputViewport text={fetched.content} language={language} />
      ) : stream && stream.length > 0 ? (
        <CommandOutputViewport text={stream} language={language} />
      ) : fetchTarget !== null ? (
        <FileContentPlaceholder state={fetched.state} reason={fetched.reason} />
      ) : (
        <ToolCallSections sections={sections} />
      )}
    </ChatItemAccordion>
  );
});

function extractCreateContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const path = readPayloadString(payload, "path");
  if (path) {
    const patchContent = extractAcpAddedFileText(payload, path);
    if (patchContent !== undefined) return patchContent;
  }
  const args = (payload as Record<string, unknown>).args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const content = (args as Record<string, unknown>).content;
  return typeof content === "string" && content.length > 0 ? content : undefined;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function formatKindVerb(kind: FileChangePayload["changeKind"]): string {
  switch (kind) {
    case "create":
      return "Create";
    case "delete":
      return "Delete";
    default:
      return "Edit";
  }
}

export function formatKindLabel(kind: FileChangePayload["changeKind"]): string {
  return `${formatKindVerb(kind)}:`;
}

/**
 * Localized counterpart of `formatKindVerb`/`formatKindLabel` for the chat row
 * title. `withPath` true renders the verb followed by a `:` (a path/title comes
 * next); false renders the standalone "<verb> file" form.
 */
function localizeKindLabel(
  kind: FileChangePayload["changeKind"],
  withPath: boolean,
  t: TranslateFn,
): string {
  switch (kind) {
    case "create":
      return withPath ? t(msg`Create:`) : t(msg`Create file`);
    case "delete":
      return withPath ? t(msg`Delete:`) : t(msg`Delete file`);
    default:
      return withPath ? t(msg`Edit:`) : t(msg`Edit file`);
  }
}

/**
 * Prefer the language detected from the file path over the structural guess
 * — `apply_patch` args for `foo.ts` should render as TypeScript, not plain.
 * Falls back to whatever `extractAcpArgsPart` decided when the path has no
 * recognized extension.
 */
function enrichLanguage(part: ExtractedPart, path: string): ExtractedPart {
  const detected = detectLanguageFromPath(path);
  if (detected !== "plain") return { ...part, language: detected };
  return part;
}

export function formatDiffSummaryLabel(
  diffSummary: FileChangePayload["diffSummary"],
): ReactNode | undefined {
  if (!diffSummary || (diffSummary.added === 0 && diffSummary.removed === 0)) {
    return undefined;
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {diffSummary.added > 0 ? <span className="text-success">+{diffSummary.added}</span> : null}
      {diffSummary.removed > 0 ? <span className="text-danger">-{diffSummary.removed}</span> : null}
    </span>
  );
}

function formatRightLabel(
  payloadStatus: FileChangePayload["status"] | undefined,
  diffSummary: DiffSummary | undefined,
  t: TranslateFn,
): ReactNode | undefined {
  if (payloadStatus === "error") {
    return <CircleAlert className="size-3 text-danger" aria-label={t(msg`error`)} />;
  }
  return formatDiffSummaryLabel(diffSummary);
}
