import { Disclosure } from "@heroui/react";
import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import {
  CircleAlert,
  Eye,
  FileEdit,
  Globe,
  Pencil,
  SearchCode,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type {
  CommandExecutionPayload,
  FileChangePayload,
  ToolCallPayload,
  WebSearchPayload,
} from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatFilePath } from "./ChatFilePath";
import { CommandOutputViewport } from "./CommandOutputViewport";
import { iconForCommandIntent } from "./CommandExecution";
import { isContextCompactionToolCall } from "./ContextCompaction";
import { formatDiffSummaryLabel, formatKindVerb } from "./FileChange";
import { isPlanProposalToolCall } from "./PlanProposal";
import { ToolCallSections, type ToolCallSection } from "./ToolCallSections";
import {
  extractAcpAddedFileText,
  extractAcpArgsPart,
  extractAcpDiffSummary,
  extractAcpDiffResultPart,
  readAcpContentEditTexts,
  extractAcpResultPart,
  extractAcpResultText,
  extractReadFileResultPart,
  readAcpStringField,
} from "./acpToolPayload";
import { commandIntentDisplay } from "./commandSummary";
import { InlineDiffView } from "./InlineDiffView";
import { detectLanguageFromPath, type ViewportLanguage } from "./languageDetect";
import { deriveToolDisplay, isSubAgentTool } from "./toolDisplay";
import { FileContentPlaceholder, useReadAbsoluteFile } from "./useReadAbsoluteFile";

interface ToolCallGroupProps {
  threadId: string;
  itemIds: readonly string[];
  /** True while this group is the tail of the timeline. Drives default expand state. */
  isLive?: boolean;
}

const TOOL_CALL_GROUP_MAX_VISIBLE_ROWS = 8;

export const ToolCallGroup = memo(function ToolCallGroup({
  threadId,
  itemIds,
  isLive = false,
}: ToolCallGroupProps) {
  const items = useAppStore(
    useShallow((state) =>
      itemIds
        .map((itemId) => state.runtimeItemsByIdByThread[threadId]?.[itemId])
        .filter((item): item is RuntimeChatItem => !!item && isToolGroupItem(item)),
    ),
  );
  const actions = useChatPaneActions();
  // Live tail expands by default so the user sees in-flight calls; collapse
  // automatically once another item arrives after the group (isLive flips
  // false). Manual toggles still apply afterwards.
  const [isExpanded, setIsExpanded] = useState(isLive);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasOverflowRows = items.length > TOOL_CALL_GROUP_MAX_VISIBLE_ROWS;

  useEffect(() => {
    if (!isLive) setIsExpanded(false);
  }, [isLive]);

  useEffect(() => {
    if (!hasOverflowRows) setShowAll(false);
  }, [hasOverflowRows]);

  // Auto-scroll to bottom when new items arrive in live mode (only relevant
  // when the full list is scrollable; collapsed mode slices to the latest rows).
  useEffect(() => {
    if (isLive && isExpanded && showAll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items.length, isLive, isExpanded, showAll]);

  if (items.length === 0) return null;
  const sections = summarizeToolCalls(items);
  const sameFileEditSummary = summarizeSameFileEditGroup(items);
  const visibleItems =
    !showAll && hasOverflowRows ? items.slice(-TOOL_CALL_GROUP_MAX_VISIBLE_ROWS) : items;

  return (
    <div className="w-full rounded-2xl border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1">
      <Disclosure
        className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
        isExpanded={isExpanded}
        onExpandedChange={(next) => {
          setIsExpanded(next);
          actions?.onContentHeightChange();
        }}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-2 py-0 text-left">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[color:var(--muted)]">
              {sameFileEditSummary ? (
                <SameFileEditGroupTitle summary={sameFileEditSummary} />
              ) : (
                sections.map((section, idx) => (
                  <Fragment key={section.category}>
                    {idx > 0 ? (
                      <span aria-hidden="true" className="select-none opacity-40">
                        ·
                      </span>
                    ) : null}
                    <span className="flex shrink-0 items-center gap-1">
                      <section.Icon className="size-3" />
                      <code className="font-mono tabular-nums !text-[color:var(--muted)]">
                        {section.count} {section.label}
                      </code>
                    </span>
                  </Fragment>
                ))
              )}
            </div>
            <Disclosure.Indicator className="size-3.5 shrink-0 text-[color:var(--muted)]" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="mt-0.5 border-t border-[color:var(--border)] pt-1">
            {hasOverflowRows && !sameFileEditSummary ? (
              <div className="mb-1 flex justify-center">
                <button
                  type="button"
                  aria-expanded={showAll}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--muted)] transition-colors hover:bg-foreground/5 hover:text-foreground"
                  onClick={() => {
                    setShowAll((prev) => !prev);
                    actions?.onContentHeightChange();
                  }}
                >
                  {showAll ? <Trans>Show less</Trans> : <Trans>Show all</Trans>}
                </button>
              </div>
            ) : null}
            <div
              ref={scrollRef}
              className={`lightcode-tool-call-group-viewport flex flex-col gap-1 pr-1 ${
                showAll ? "max-h-[420px] overflow-y-auto" : ""
              }`}
            >
              {sameFileEditSummary ? (
                <SameFileEditGroupBody items={items} />
              ) : (
                visibleItems.map((item) => (
                  <div key={item.id} className="animate-tool-call-enter">
                    <ToolCallInline item={item} />
                  </div>
                ))
              )}
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
});

interface SameFileEditGroupSummary {
  count: number;
  path: string;
  diffSummary?: NonNullable<FileChangePayload["diffSummary"]>;
}

function SameFileEditGroupTitle({ summary }: { summary: SameFileEditGroupSummary }) {
  const diffLabel = formatDiffSummaryLabel(summary.diffSummary);
  const label = `${summary.count} ${summary.count === 1 ? "edit" : "edits"}:`;
  return (
    <>
      <span className="flex shrink-0 items-center gap-1">
        <Pencil className="size-3" />
        <code className="font-mono tabular-nums !text-[color:var(--muted)]">{label}</code>
      </span>
      <code className="flex min-w-0 flex-1 font-mono !text-[color:var(--muted)]">
        <ChatFilePath
          className="flex-1"
          path={summary.path}
          basenameClassName="!text-[color:var(--foreground)]"
          dirClassName="!text-[color:var(--muted)]"
        />
      </code>
      {diffLabel ? <span className="shrink-0 tabular-nums font-medium">{diffLabel}</span> : null}
    </>
  );
}

/**
 * Flattened body for a group where every item edits the same file: renders
 * each edit's diff directly, in order, without nesting each edit behind its
 * own disclosure row. Edits without a renderable diff (e.g. still running)
 * fall back to the regular inline row.
 */
function SameFileEditGroupBody({ items }: { items: readonly RuntimeChatItem[] }) {
  const { t } = useLingui();
  return (
    <>
      {items.map((item) => {
        const row = getInlineRow(item, true, t);
        if (!row?.bodyText) {
          return (
            <div key={item.id} className="animate-tool-call-enter">
              <ToolCallInline item={item} />
            </div>
          );
        }
        return (
          <div key={item.id} className="animate-tool-call-enter">
            {row.bodyKind === "diff" ? (
              <InlineDiffView
                diffText={row.bodyText}
                filePath={row.bodyFilePath ?? ""}
                {...(row.bodyOldText !== undefined && row.bodyNewText !== undefined
                  ? { oldText: row.bodyOldText, newText: row.bodyNewText }
                  : {})}
              />
            ) : (
              <CommandOutputViewport
                text={row.bodyText}
                {...(row.bodyLanguage ? { language: row.bodyLanguage } : {})}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function ToolCallInline({ item }: { item: RuntimeChatItem }) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  const [isExpanded, setIsExpanded] = useState(false);
  const row = getInlineRow(item, isExpanded, t);
  const fetchTarget =
    row?.fetchPath && actions?.projectLocation
      ? { path: row.fetchPath, projectLocation: actions.projectLocation }
      : null;
  const fetched = useReadAbsoluteFile(isExpanded ? fetchTarget : null);
  if (!row) return null;
  const Icon = row.Icon;

  if (!row.hasDetails) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 py-0.5 text-[length:var(--lc-chat-font-size-command)] leading-tight">
        <Icon className="size-3 shrink-0 text-[color:var(--muted)]" />
        <InlineRowTitle
          title={row.title}
          {...(row.titleParts ? { titleParts: row.titleParts } : {})}
        />
        {row.rightLabel ? (
          <span className={`shrink-0 tabular-nums font-medium ${row.rightLabelClassName}`}>
            {row.rightLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Disclosure
      className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
      isExpanded={isExpanded}
      onExpandedChange={(next) => {
        setIsExpanded(next);
        actions?.onContentHeightChange();
      }}
    >
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-1.5 py-0.5 text-left">
          <Icon className="size-3 shrink-0 text-[color:var(--muted)]" />
          <InlineRowTitle
            title={row.title}
            {...(row.titleParts ? { titleParts: row.titleParts } : {})}
          />
          {row.rightLabel ? (
            <span className={`shrink-0 tabular-nums font-medium ${row.rightLabelClassName}`}>
              {row.rightLabel}
            </span>
          ) : null}
          <Disclosure.Indicator className="size-3.5 shrink-0 text-[color:var(--muted)]" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pb-1 pl-4 pt-1">
          {fetchTarget ? (
            fetched.content !== undefined ? (
              <CommandOutputViewport
                text={fetched.content}
                language={detectLanguageFromPath(fetchTarget.path)}
              />
            ) : (
              <FileContentPlaceholder state={fetched.state} reason={fetched.reason} />
            )
          ) : row.bodyText ? (
            row.bodyKind === "diff" ? (
              <InlineDiffView
                diffText={row.bodyText}
                filePath={row.bodyFilePath ?? ""}
                {...(row.bodyOldText !== undefined && row.bodyNewText !== undefined
                  ? { oldText: row.bodyOldText, newText: row.bodyNewText }
                  : {})}
              />
            ) : (
              <CommandOutputViewport
                text={row.bodyText}
                {...(row.bodyLanguage ? { language: row.bodyLanguage } : {})}
              />
            )
          ) : null}
          {fetchTarget ? null : <ToolCallSections sections={row.sections} />}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

type InlineRow = {
  Icon: LucideIcon;
  title: string;
  /**
   * Optional structured title — see `ToolDisplay.parts`. When present the row
   * keeps `prefix` fully visible and truncates `path` from the start. When
   * `filePath` is set the path renders as `<basename> <muted dir>`.
   */
  titleParts?: { prefix: string; path: string; filePath?: boolean };
  rightLabel?: ReactNode;
  rightLabelClassName: string;
  hasDetails: boolean;
  sections: ToolCallSection[];
  bodyText?: string | undefined;
  bodyLanguage?: ViewportLanguage | undefined;
  bodyKind?: "text" | "diff" | undefined;
  bodyFilePath?: string | undefined;
  bodyOldText?: string | undefined;
  bodyNewText?: string | undefined;
  /**
   * Absolute path to lazily read from disk when the row is expanded. Set for
   * ACP read tools (e.g. Gemini's `read_file`) that report `locations[]` but
   * no file content in `result`. The renderer fetches via `readAbsoluteFile`
   * and shows the body with syntax highlighting.
   */
  fetchPath?: string | undefined;
};

function InlineRowTitle({
  title,
  titleParts,
}: {
  title: string;
  titleParts?: { prefix: string; path: string; filePath?: boolean };
}) {
  if (titleParts) {
    return (
      <code className="flex min-w-0 flex-1 items-baseline overflow-hidden font-mono !text-[color:var(--muted)]">
        <span className="shrink-0 whitespace-pre">{titleParts.prefix}</span>
        {titleParts.filePath ? (
          <>
            <span className="sr-only">{titleParts.path}</span>
            <ChatFilePath
              className="flex-1"
              path={titleParts.path}
              basenameClassName="!text-[color:var(--foreground)]"
              dirClassName="!text-[color:var(--muted)]"
            />
          </>
        ) : (
          <span className="lc-truncate-start flex-1">{titleParts.path}</span>
        )}
      </code>
    );
  }
  return (
    <code className="min-w-0 flex-1 truncate font-mono !text-[color:var(--muted)]">{title}</code>
  );
}

function getInlineRow(
  item: RuntimeChatItem,
  isExpanded: boolean,
  t: TranslateFn,
): InlineRow | null {
  if (item.type === "command_execution") return getCommandRow(item, isExpanded, t);
  if (item.type === "file_change") return getFileChangeRow(item, isExpanded);
  if (item.type === "web_search") return getWebSearchRow(item, isExpanded, t);
  return getToolCallRow(item, isExpanded);
}

function getToolCallRow(item: RuntimeChatItem, isExpanded: boolean): InlineRow | null {
  const payload = getToolLikePayload(item);
  if (!payload?.name) return null;
  const display = deriveToolDisplay(payload);
  const diffPart = isEditLikeToolPayload(payload) ? extractAcpDiffResultPart(payload) : undefined;
  const diffText = diffPart?.text || undefined;
  const lazyReadPath = pickLazyReadPath(payload);
  const readPart =
    isReadLikeToolPayload(payload) && !lazyReadPath
      ? extractReadFileResultPart(payload)
      : undefined;
  const readText = readPart?.text ?? "";
  const readPath = isReadLikeToolPayload(payload)
    ? display.parts?.filePath
      ? display.parts.path
      : pickFirstLocationPath(payload)
    : undefined;
  const hasDetails =
    payload.args !== undefined ||
    payload.result !== undefined ||
    !!diffText ||
    !!lazyReadPath ||
    readText.length > 0;
  const sections: ToolCallSection[] =
    isExpanded && hasDetails && !diffText && !lazyReadPath && readText.length === 0
      ? [
          { label: "args", part: extractAcpArgsPart(payload) },
          { label: "result", part: extractAcpResultPart(payload) },
        ]
      : [];
  const isRunning = item.state !== "completed";
  const isError = payload.status === "error";
  const diffSummary = diffText ? extractAcpDiffSummary(payload) : undefined;
  const rightLabel: ReactNode = isRunning ? (
    <PixelLoader size="xxs" className="text-[color:var(--muted)]" />
  ) : isError ? (
    <ErrorIcon />
  ) : diffSummary ? (
    formatDiffSummaryLabel(diffSummary)
  ) : undefined;
  return {
    Icon: display.Icon,
    title: display.title,
    ...(display.parts ? { titleParts: display.parts } : {}),
    rightLabel,
    rightLabelClassName: isError ? "text-danger" : "text-[color:var(--muted)]",
    hasDetails,
    sections,
    bodyText: isExpanded ? (diffText ?? (readText.length > 0 ? readText : undefined)) : undefined,
    bodyLanguage: readPart?.language ?? (readPath ? detectLanguageFromPath(readPath) : undefined),
    bodyKind: diffText ? "diff" : "text",
    bodyFilePath: display.parts?.filePath ? display.parts.path : readPath,
    fetchPath: lazyReadPath,
  };
}

/**
 * For ACP read tools that didn't carry the file content in the result (e.g.
 * Gemini's `read_file`), return the absolute path so the renderer can lazily
 * fetch the file from disk when the row is expanded. Returns undefined when
 * the payload already contains a result — those use the existing result path.
 */
function pickLazyReadPath(payload: ToolCallPayload): string | undefined {
  if (!isReadLikeToolPayload(payload)) return undefined;
  if (payload.result !== undefined) return undefined;
  return payload.locations?.find((location) => location.path.length > 0)?.path;
}

function pickFirstLocationPath(payload: ToolCallPayload): string | undefined {
  return payload.locations?.find((location) => location.path.length > 0)?.path;
}

function isEditLikeToolPayload(payload: ToolCallPayload): boolean {
  switch (payload.kind) {
    case "edit":
    case "delete":
    case "move":
      return true;
  }
  return categorizeToolName(payload.name) === "edited";
}

function isReadLikeToolPayload(payload: ToolCallPayload): boolean {
  const kind = payload.kind?.trim().toLowerCase();
  if (kind === "read" || kind === "readfile") return true;
  if (payload.name === "Read" || payload.name === "NotebookRead" || payload.name === "ReadFile")
    return true;
  const title = payload.title?.trim() || payload.name.trim();
  return /^(?:view|read)(?:ing)?(?:\s|:|$)/i.test(title);
}

function ErrorIcon() {
  const { t } = useLingui();
  return <CircleAlert className="size-3 text-danger" aria-label={t`error`} />;
}

function getCommandRow(
  item: RuntimeChatItem,
  isExpanded: boolean,
  t: TranslateFn,
): InlineRow | null {
  const payload = getRuntimeItemPayload<CommandExecutionPayload>(item, "command_execution");
  const command = readCommandPayloadCommand(payload);
  const display = command ? commandIntentDisplay(command) : undefined;
  const output =
    item.streams.command_output && item.streams.command_output.length > 0
      ? item.streams.command_output
      : extractAcpResultText(payload);
  const outputPath = display?.kind === "view" ? display.parts?.path : undefined;
  const isRunning = item.state !== "completed";
  const isErrorExit =
    !isRunning &&
    (payload?.status === "error" || (payload?.exitCode != null && payload.exitCode !== 0));
  const rightLabel: ReactNode = isRunning ? (
    <PixelLoader size="xxs" className="text-[color:var(--muted)]" />
  ) : isErrorExit ? (
    <ErrorIcon />
  ) : undefined;
  return {
    Icon: display ? iconForCommandIntent(display.kind) : Terminal,
    title: display?.title ?? t(msg`Run command`),
    ...(display?.parts ? { titleParts: display.parts } : {}),
    rightLabel,
    rightLabelClassName: isErrorExit ? "text-danger" : "text-[color:var(--muted)]",
    hasDetails: output.length > 0,
    sections: [],
    bodyText: isExpanded ? output : undefined,
    bodyLanguage: outputPath ? detectLanguageFromPath(outputPath) : undefined,
  };
}

function getFileChangeRow(item: RuntimeChatItem, isExpanded: boolean): InlineRow | null {
  const payload = getRuntimeItemPayload<FileChangePayload>(item, "file_change");
  if (!payload) return null;
  const isCreate = payload.changeKind === "create";
  const createContent = isCreate ? extractCreateContent(payload) : undefined;
  const diffPart = !isCreate ? extractAcpDiffResultPart(payload) : undefined;
  const diffText = diffPart?.text || undefined;
  const contentEdit = readAcpContentEditTexts(payload);
  const sections: ToolCallSection[] =
    isExpanded &&
    !diffText &&
    createContent === undefined &&
    (hasAuxFields(payload) || !item.streams.file_change_output)
      ? [
          { label: "args", part: extractAcpArgsPart(payload) },
          { label: "result", part: extractAcpResultPart(payload) },
        ]
      : [];
  const isRunning = item.state !== "completed";
  const diffSummary = payload.diffSummary ?? extractAcpDiffSummary(payload);
  const isError = payload.status === "error";
  const rightLabel: ReactNode = isRunning ? (
    <PixelLoader size="xxs" className="text-[color:var(--muted)]" />
  ) : isError ? (
    <ErrorIcon />
  ) : diffSummary ? (
    formatDiffSummaryLabel(diffSummary)
  ) : undefined;
  const kindVerb = formatKindVerb(payload.changeKind);
  // ACP can emit file_change items without an extractable path (path === "").
  // Fall back to the human-readable tool title carried on the ACP payload so
  // the row stays visible inside the group instead of silently dropping out.
  const hasPath = !!payload.path && payload.path.length > 0;
  const fallbackName = readPayloadString(payload, "name");
  const fallbackUsable = !!fallbackName && fallbackName.toLowerCase() !== kindVerb.toLowerCase();
  const pathOrName = hasPath ? payload.path : fallbackUsable ? fallbackName : undefined;
  const title = pathOrName ? `${kindVerb}: ${pathOrName}` : kindVerb;
  const titleParts = hasPath
    ? { prefix: `${kindVerb}: `, path: payload.path, filePath: true }
    : undefined;
  return {
    Icon: FileEdit,
    title,
    ...(titleParts ? { titleParts } : {}),
    rightLabel,
    rightLabelClassName: isError ? "text-danger" : "text-[color:var(--muted)]",
    hasDetails:
      !!diffText ||
      !!item.streams.file_change_output ||
      createContent !== undefined ||
      hasAuxFields(payload),
    sections,
    bodyText: isExpanded
      ? (diffText ?? createContent ?? item.streams.file_change_output)
      : undefined,
    bodyLanguage: createContent !== undefined ? detectLanguageFromPath(payload.path) : undefined,
    bodyKind: diffText ? "diff" : "text",
    bodyFilePath: payload.path,
    ...(contentEdit ? { bodyOldText: contentEdit.oldText, bodyNewText: contentEdit.newText } : {}),
  };
}

function getWebSearchRow(
  item: RuntimeChatItem,
  isExpanded: boolean,
  t: TranslateFn,
): InlineRow | null {
  const payload = getRuntimeItemPayload<WebSearchPayload>(item, "web_search");
  if (!payload) return null;
  const title = payload.query || formatWebSearchName(readPayloadString(payload, "name"), t);
  const sections: ToolCallSection[] =
    isExpanded && hasAuxFields(payload)
      ? [
          { label: "query", part: extractAcpArgsPart(payload) },
          { label: "results", part: extractAcpResultPart(payload) },
        ]
      : [];
  const isRunning = item.state !== "completed";
  const resultCount = payload.resultCount ?? deriveResultCount(payload);
  const rightLabel: ReactNode = isRunning ? (
    <PixelLoader size="xxs" className="text-[color:var(--muted)]" />
  ) : resultCount != null ? (
    <Plural value={resultCount} one="# result" other="# results" />
  ) : undefined;
  return {
    Icon: Globe,
    title,
    rightLabel,
    rightLabelClassName: "text-[color:var(--muted)]",
    hasDetails: hasAuxFields(payload),
    sections,
  };
}

function formatWebSearchName(name: string | undefined, t: TranslateFn): string {
  return name === "WebSearch" || !name ? t(msg`Web search`) : name;
}

type GroupCategory = "viewed" | "searched" | "edited" | "executed" | "other";

interface CategoryMeta {
  Icon: LucideIcon;
  singular: string;
  plural: string;
  /** Tiebreaker when two categories share a count — lower wins. */
  priority: number;
}

const CATEGORY_META: Record<GroupCategory, CategoryMeta> = {
  viewed: { Icon: Eye, singular: "view", plural: "views", priority: 0 },
  searched: { Icon: SearchCode, singular: "search", plural: "searches", priority: 1 },
  edited: { Icon: Pencil, singular: "edit", plural: "edits", priority: 2 },
  executed: { Icon: Terminal, singular: "command", plural: "commands", priority: 3 },
  other: { Icon: Wrench, singular: "tool", plural: "tools", priority: 4 },
};

interface GroupSection {
  category: GroupCategory;
  count: number;
  label: string;
  Icon: LucideIcon;
}

function summarizeToolCalls(items: readonly RuntimeChatItem[]): GroupSection[] {
  const counts = new Map<GroupCategory, number>();
  for (const item of items) {
    const category = categorizeItem(item);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(
      ([aCat, aCount], [bCat, bCount]) =>
        bCount - aCount || CATEGORY_META[aCat].priority - CATEGORY_META[bCat].priority,
    )
    .map(([category, count]) => {
      const meta = CATEGORY_META[category];
      return {
        category,
        count,
        label: count === 1 ? meta.singular : meta.plural,
        Icon: meta.Icon,
      };
    });
}

function summarizeSameFileEditGroup(
  items: readonly RuntimeChatItem[],
): SameFileEditGroupSummary | null {
  if (items.length <= 1) return null;

  let sharedPath: string | undefined;
  let added = 0;
  let removed = 0;
  let hasDiffSummary = false;
  let missingDiffSummary = false;

  for (const item of items) {
    if (categorizeItem(item) !== "edited") return null;
    const path = readEditGroupPath(item);
    if (!path) return null;
    if (sharedPath === undefined) {
      sharedPath = path;
    } else if (normalizeEditGroupPath(sharedPath) !== normalizeEditGroupPath(path)) {
      return null;
    }

    const diffSummary = readEditDiffSummary(item);
    if (diffSummary) {
      hasDiffSummary = true;
      added += diffSummary.added;
      removed += diffSummary.removed;
    } else {
      missingDiffSummary = true;
    }
  }

  if (!sharedPath) return null;
  return {
    count: items.length,
    path: sharedPath,
    ...(hasDiffSummary && !missingDiffSummary ? { diffSummary: { added, removed } } : {}),
  };
}

function readEditGroupPath(item: RuntimeChatItem): string | undefined {
  if (item.type === "file_change") {
    const payload = getRuntimeItemPayload<FileChangePayload>(item, "file_change");
    return payload?.path && payload.path.length > 0 ? payload.path : undefined;
  }
  if (!isToolLikeItem(item)) return undefined;
  const payload = getToolLikePayload(item);
  if (!payload) return undefined;
  const display = deriveToolDisplay(payload);
  if (display.parts?.filePath && display.parts.path.length > 0) return display.parts.path;
  return payload.locations?.find((location) => location.path.length > 0)?.path;
}

function readEditDiffSummary(
  item: RuntimeChatItem,
): NonNullable<FileChangePayload["diffSummary"]> | undefined {
  if (item.type === "file_change") {
    const payload = getRuntimeItemPayload<FileChangePayload>(item, "file_change");
    return payload?.diffSummary ?? extractAcpDiffSummary(payload);
  }
  if (!isToolLikeItem(item)) return undefined;
  const payload = getToolLikePayload(item);
  return payload && isEditLikeToolPayload(payload) ? extractAcpDiffSummary(payload) : undefined;
}

function normalizeEditGroupPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function isToolGroupItem(item: RuntimeChatItem): boolean {
  if (isContextCompactionToolCall(item)) return false;
  if (isPlanProposalToolCall(item)) return false;
  return (
    isToolLikeItem(item) ||
    item.type === "command_execution" ||
    item.type === "file_change" ||
    item.type === "web_search"
  );
}

function categorizeItem(item: RuntimeChatItem): GroupCategory {
  if (item.type === "command_execution") return categorizeCommandExecution(item);
  if (item.type === "file_change") return "edited";
  if (item.type === "web_search") return "searched";
  const payload = getToolLikePayload(item);
  if (!payload) return "other";
  if (isSubAgentTool(payload)) return "executed";

  switch (payload.kind) {
    case "read":
      return "viewed";
    case "search":
    case "fetch":
      return "searched";
    case "edit":
    case "delete":
    case "move":
      return "edited";
    case "execute":
      return "executed";
  }

  const summary = categorizePersistedToolSummary(payload.name ?? "");
  if (summary) return summary;

  const byName = categorizeToolName(payload.name ?? "");
  if (byName !== "other") return byName;
  return categorizeVerbPrefix(payload.name ?? "");
}

function isToolLikeItem(item: RuntimeChatItem): boolean {
  return (
    item.type === "tool_call" ||
    item.type === "mcp_tool_call" ||
    item.type === "image_view" ||
    item.type === "dynamic_tool_call"
  );
}

function getToolLikePayload(item: RuntimeChatItem): ToolCallPayload | undefined {
  return isToolLikeItem(item) ? (item.payload as ToolCallPayload | undefined) : undefined;
}

function categorizeCommandExecution(item: RuntimeChatItem): GroupCategory {
  const payload = getRuntimeItemPayload<CommandExecutionPayload>(item, "command_execution");
  const command = readCommandPayloadCommand(payload);
  if (!command) return "executed";
  switch (commandIntentDisplay(command).kind) {
    case "view":
    case "list":
      return "viewed";
    case "search":
      return "searched";
    default:
      return "executed";
  }
}

function readCommandPayloadCommand(payload: CommandExecutionPayload | undefined): string {
  return payload?.command && payload.command.length > 0
    ? payload.command
    : (readAcpStringField(payload, "command") ?? "");
}

function categorizeToolName(name: string): GroupCategory {
  switch (name) {
    case "Read":
    case "NotebookRead":
      return "viewed";
    case "Grep":
    case "Glob":
    case "LS":
    case "List":
    case "WebSearch":
    case "WebFetch":
    case "ToolSearch":
      return "searched";
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
    case "Patch":
    case "ApplyPatch":
    case "apply_patch":
      return "edited";
    case "Bash":
    case "BashOutput":
    case "KillBash":
    case "KillShell":
      return "executed";
    default:
      return "other";
  }
}

const SUMMARY_CATEGORY_LABELS: Record<GroupCategory, readonly string[]> = {
  viewed: ["view", "views"],
  searched: ["search", "searches"],
  edited: ["edit", "edits"],
  executed: ["command", "commands"],
  other: ["tool", "tools"],
};

function categorizePersistedToolSummary(name: string): GroupCategory | null {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const counts = new Map<GroupCategory, number>();
  for (const part of parts) {
    const match = /^(\d+)\s+([a-z]+)$/i.exec(part);
    if (!match) return null;
    const count = Number(match[1]);
    const category = categoryFromSummaryLabel(match[2]!);
    if (!Number.isFinite(count) || !category) return null;
    counts.set(category, (counts.get(category) ?? 0) + count);
  }

  return (
    [...counts.entries()].sort(
      ([aCat, aCount], [bCat, bCount]) =>
        bCount - aCount || CATEGORY_META[aCat].priority - CATEGORY_META[bCat].priority,
    )[0]?.[0] ?? null
  );
}

function categoryFromSummaryLabel(label: string): GroupCategory | null {
  const normalized = label.toLowerCase();
  for (const [category, labels] of Object.entries(SUMMARY_CATEGORY_LABELS) as Array<
    [GroupCategory, readonly string[]]
  >) {
    if (labels.includes(normalized)) return category;
  }
  return null;
}

function hasAuxFields(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.args !== undefined || p.result !== undefined;
}

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
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function deriveResultCount(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return undefined;
  const contents = (result as Record<string, unknown>).contents;
  if (Array.isArray(contents)) return contents.length;
  return undefined;
}

function categorizeVerbPrefix(name: string): GroupCategory {
  const t = name.toLowerCase().trim();
  if (t.startsWith("viewing") || t.startsWith("reading") || t.startsWith("read ")) return "viewed";
  if (
    t.startsWith("searching") ||
    t.startsWith("finding") ||
    t.startsWith("grep") ||
    t.startsWith("listing") ||
    t.startsWith("fetch")
  ) {
    return "searched";
  }
  if (
    t.startsWith("editing") ||
    t.startsWith("writing") ||
    t.startsWith("patching") ||
    t.startsWith("creating") ||
    t.startsWith("deleting") ||
    t.startsWith("removing")
  ) {
    return "edited";
  }
  if (t.startsWith("running") || t.startsWith("executing") || t.startsWith("shell")) {
    return "executed";
  }
  return "other";
}
