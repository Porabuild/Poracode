import { Disclosure } from "@heroui/react";
import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import { CircleAlert, FileEdit, Globe, Pencil, Terminal, type LucideIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type {
  CommandExecutionPayload,
  FileChangePayload,
  ToolCallPayload,
  WebSearchPayload,
} from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { useShimmer } from "@/renderer/thinkingAnimator";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatFilePath } from "./ChatFilePath";
import {
  ChatRowMeta,
  chatRowClass,
  chatRowHoverClass,
  chatRowIndicatorClass,
  chatRowRailClass,
  chatRowShellClass,
  inlineRowTriggerClass,
  normalizeCallTitleSeparator,
} from "./chatRow";
import { CommandOutputViewport } from "./CommandOutputViewport";
import { iconForCommandIntent } from "./CommandExecution";
import { formatDiffSummaryLabel, formatKindVerb } from "./FileChange";
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
} from "./acpToolPayload";
import { commandIntentDisplay } from "./commandSummary";
import { LazyInlineDiffView } from "./LazyInlineDiffView";
import { ReasoningInline } from "./ReasoningInline";
import { detectLanguageFromPath, type ViewportLanguage } from "./languageDetect";
import {
  analyzeEditToolGroup,
  getToolLikePayload,
  isEditLikeToolPayload,
  isToolGroupItem,
  readCommandPayloadCommand,
  segmentToolGroupRows,
  summarizeToolCalls,
  type SameFileEditGroupSummary,
  type ToolGroupRowSegment,
} from "./toolCallCategorization";
import { deriveToolDisplay } from "./toolDisplay";
import { deriveWebSearchDisplay } from "./webSearchDisplay";
import { FileContentPlaceholder, useReadAbsoluteFile } from "./useReadAbsoluteFile";

interface ToolCallGroupProps {
  threadId: string;
  itemIds: readonly string[];
  /** True while this group is the tail of the timeline. Drives default expand state. */
  isLive?: boolean;
  /** Synchronously remeasure the owning virtual row after an explicit layout change. */
  onHeightChange?: () => void;
  /** Arm scroll anchoring before a disclosure commits a new row height. */
  onVirtualizerLayoutChange?: () => void;
}

const TOOL_CALL_GROUP_MAX_VISIBLE_ROWS = 8;

export const ToolCallGroup = memo(function ToolCallGroup({
  threadId,
  itemIds,
  isLive = false,
  onHeightChange,
  onVirtualizerLayoutChange,
}: ToolCallGroupProps) {
  const items = useAppStore(
    useShallow((state) =>
      itemIds
        .map((itemId) => state.runtimeItemsByIdByThread[threadId]?.[itemId])
        .filter((item): item is RuntimeChatItem => !!item && isToolGroupItem(item)),
    ),
  );
  const actions = useChatPaneActions();
  // Single pass: edit-only groups stay collapsed while live; same-file multi
  // patches also get the compact "N edits: path" header.
  const { editOnly: editOnlyGroup, sameFile: sameFileEditSummary } = analyzeEditToolGroup(items);
  // Mixed groups render per-segment: strictly consecutive same-file edits
  // collapse into one merged edit row; everything else stays its own row.
  const segments = segmentToolGroupRows(items);
  const [isExpanded, setIsExpanded] = useState(() => isLive && !editOnlyGroup);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousLayoutRef = useRef({ isExpanded, showAll });
  const hasOverflowRows = segments.length > TOOL_CALL_GROUP_MAX_VISIBLE_ROWS;
  // Preserve manual open/close across live-tail item updates.
  const userToggledRef = useRef(false);

  useLayoutEffect(() => {
    const previous = previousLayoutRef.current;
    if (previous.isExpanded === isExpanded && previous.showAll === showAll) return;
    previousLayoutRef.current = { isExpanded, showAll };
    if (onHeightChange) {
      onHeightChange();
    } else {
      actions?.onContentHeightChange();
    }
  }, [actions, isExpanded, onHeightChange, showAll]);

  useEffect(() => {
    if (!isLive) {
      userToggledRef.current = false;
      setIsExpanded(false);
      return;
    }
    if (!userToggledRef.current) setIsExpanded(!editOnlyGroup);
  }, [isLive, editOnlyGroup]);

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
  const visibleSegments =
    !showAll && hasOverflowRows ? segments.slice(-TOOL_CALL_GROUP_MAX_VISIBLE_ROWS) : segments;

  return (
    <div className={chatRowShellClass}>
      <Disclosure
        className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
        isExpanded={isExpanded}
        onExpandedChange={(next) => {
          // Arm the virtualizer guard before React commits the larger/smaller
          // row. LegendList can adjust its visible-content anchor during that
          // commit, before the post-commit remeasurement callback runs.
          onVirtualizerLayoutChange?.();
          userToggledRef.current = true;
          setIsExpanded(next);
        }}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className={`group ${chatRowClass} gap-2 ${chatRowHoverClass}`}>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[color:var(--muted)]">
              {sameFileEditSummary ? (
                <SameFileEditGroupTitle summary={sameFileEditSummary} />
              ) : (
                sections.map((section, idx) => {
                  const diffLabel = formatDiffSummaryLabel(section.diffSummary, {
                    animated: true,
                  });
                  return (
                    <Fragment key={section.category}>
                      {idx > 0 ? (
                        <span aria-hidden="true" className="select-none opacity-40">
                          ·
                        </span>
                      ) : null}
                      <span className="flex shrink-0 items-center gap-1">
                        <section.Icon className="size-3" />
                        <code className="font-mono tabular-nums [word-spacing:-0.25em] !text-[color:var(--muted)]">
                          <AnimatedNumber value={section.count} />{" "}
                          {section.category === "mcp" ? (
                            <Plural value={section.count} one="MCP" other="MCPs" />
                          ) : (
                            section.label
                          )}
                        </code>
                        {diffLabel ? (
                          <span className="shrink-0 tabular-nums font-medium">{diffLabel}</span>
                        ) : null}
                      </span>
                    </Fragment>
                  );
                })
              )}
            </div>
            <Disclosure.Indicator className={chatRowIndicatorClass} />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={`ml-1.5 ${chatRowRailClass} pb-0 pl-2.5 pt-0`}>
            {/* React Aria keeps collapsed disclosure panels mounted (hidden), so
                gate the heavy group children on `isExpanded` — matches
                ChatItemAccordion. Panels snap closed (transitions disabled in
                styles.css), so a plain conditional is correct; no keep-alive. */}
            {isExpanded ? (
              <>
                {hasOverflowRows && !sameFileEditSummary ? (
                  <div className="mb-0.5 flex justify-start">
                    <button
                      type="button"
                      aria-expanded={showAll}
                      className="-ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--muted)] transition-colors hover:bg-foreground/5 hover:text-foreground"
                      onClick={() => {
                        onVirtualizerLayoutChange?.();
                        setShowAll((prev) => !prev);
                      }}
                    >
                      {showAll ? <Trans>Show less</Trans> : <Trans>Show all</Trans>}
                    </button>
                  </div>
                ) : null}
                <div
                  ref={scrollRef}
                  className={`poracode-tool-call-group-viewport flex flex-col gap-0.5 pr-1 ${
                    showAll ? "max-h-[420px] overflow-y-auto" : ""
                  }`}
                >
                  {sameFileEditSummary ? (
                    <SameFileEditGroupBody items={items} />
                  ) : (
                    visibleSegments.map((segment) => (
                      <div key={segmentKey(segment)} className="animate-tool-call-enter">
                        {segment.kind === "same-file-edits" ? (
                          <SameFileEditRunInline items={segment.items} summary={segment.summary} />
                        ) : (
                          <GroupRowInline item={segment.item} />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
});

function segmentKey(segment: ToolGroupRowSegment): string {
  return segment.kind === "same-file-edits" ? segment.items[0]!.id : segment.item.id;
}

/**
 * Inline row for a consecutive same-file edit run inside a mixed group: the
 * compact "N edits: path" header with the aggregated diff count, expanding to
 * the same merged file diff the whole-group same-file treatment uses.
 */
function SameFileEditRunInline({
  items,
  summary,
}: {
  items: readonly RuntimeChatItem[];
  summary: SameFileEditGroupSummary;
}) {
  const actions = useChatPaneActions();
  const [isExpanded, setIsExpanded] = useState(false);
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
        <Disclosure.Trigger className={inlineRowTriggerClass}>
          <SameFileEditGroupTitle summary={summary} />
          <Disclosure.Indicator className={chatRowIndicatorClass} />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pb-1 pl-4 pt-1">
          {isExpanded ? <SameFileEditGroupBody items={items} /> : null}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function SameFileEditGroupTitle({ summary }: { summary: SameFileEditGroupSummary }) {
  // Both the count and the totals grow while consecutive edits to the same file
  // keep collapsing into this one header, so they animate in place.
  const diffLabel = formatDiffSummaryLabel(summary.diffSummary, { animated: true });
  return (
    <>
      <span className="flex shrink-0 items-center gap-1">
        <Pencil className="size-3" />
        <code className="font-mono tabular-nums [word-spacing:-0.25em] !text-[color:var(--muted)]">
          <AnimatedNumber value={summary.count} />{" "}
          <Plural value={summary.count} one="edit" other="edits" />:
        </code>
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
 * Flattened body for a consecutive same-file multi-edit group: one merged file
 * diff, without nesting each patch behind its own disclosure row. Edits without
 * a renderable patch (e.g. still running) fall back to the regular inline row.
 */
function SameFileEditGroupBody({ items }: { items: readonly RuntimeChatItem[] }) {
  const { t } = useLingui();
  const diffRows: InlineRow[] = [];
  const nonDiffBodies: InlineRow[] = [];
  const fallbackItems: RuntimeChatItem[] = [];

  for (const item of items) {
    const row = getInlineRow(item, true, t);
    if (row?.bodyText && row.bodyKind === "diff") {
      diffRows.push(row);
      continue;
    }
    if (row?.bodyText) {
      nonDiffBodies.push(row);
      continue;
    }
    fallbackItems.push(item);
  }

  const filePath = diffRows.find((row) => row.bodyFilePath)?.bodyFilePath ?? "";
  const mergedDiffText =
    diffRows.length > 0 ? diffRows.map((row) => row.bodyText).join("\n") : undefined;
  // Content-backed rendering is only valid for a single patch: multi-edit merges
  // share one unified path but intermediate old/new strings are per-step.
  const singleContent =
    diffRows.length === 1 &&
    diffRows[0]!.bodyOldText !== undefined &&
    diffRows[0]!.bodyNewText !== undefined
      ? { oldText: diffRows[0]!.bodyOldText, newText: diffRows[0]!.bodyNewText }
      : null;

  return (
    <>
      {mergedDiffText ? (
        <div className="animate-tool-call-enter">
          <LazyInlineDiffView
            diffText={mergedDiffText}
            filePath={filePath}
            {...(singleContent ?? {})}
          />
        </div>
      ) : null}
      {nonDiffBodies.map((row, index) => (
        <div key={`same-file-body-${index}`} className="animate-tool-call-enter">
          <CommandOutputViewport
            text={row.bodyText!}
            {...(row.bodyLanguage ? { language: row.bodyLanguage } : {})}
          />
        </div>
      ))}
      {fallbackItems.map((item) => (
        <div key={item.id} className="animate-tool-call-enter">
          <GroupRowInline item={item} />
        </div>
      ))}
    </>
  );
}

/**
 * Type dispatch for a row inside a tool-call group. Every call site that
 * renders group children goes through this so non-tool row types (reasoning
 * today) get their dedicated renderer everywhere.
 */
function GroupRowInline({ item }: { item: RuntimeChatItem }) {
  if (item.type === "reasoning") return <ReasoningInline item={item} />;
  return <ToolCallInline item={item} />;
}

function ToolCallInline({ item }: { item: RuntimeChatItem }) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  const [isExpanded, setIsExpanded] = useState(false);
  const row = getInlineRow(item, isExpanded, t);
  const isRunning = item.state !== "completed";
  const fetchTarget =
    row?.fetchPath && actions?.projectLocation
      ? { path: row.fetchPath, projectLocation: actions.projectLocation }
      : null;
  const fetched = useReadAbsoluteFile(isExpanded ? fetchTarget : null);
  if (!row) return null;
  const Icon = row.Icon;

  if (!row.hasDetails) {
    return (
      <div className="flex w-fit max-w-full min-w-0 items-center gap-1.5 py-0.5 text-[length:var(--lc-chat-font-size-command)] leading-tight">
        <Icon className="size-3 shrink-0 text-[color:var(--muted)]" />
        <InlineRowTitle
          isRunning={isRunning}
          title={row.title}
          {...(row.titleParts ? { titleParts: row.titleParts } : {})}
        />
        <ChatRowMeta label={row.rightLabel} className={row.rightLabelClassName} />
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
        <Disclosure.Trigger className={inlineRowTriggerClass}>
          <Icon className="size-3 shrink-0 text-[color:var(--muted)]" />
          <InlineRowTitle
            isRunning={isRunning}
            title={row.title}
            {...(row.titleParts ? { titleParts: row.titleParts } : {})}
          />
          <ChatRowMeta label={row.rightLabel} className={row.rightLabelClassName} />
          <Disclosure.Indicator className={chatRowIndicatorClass} />
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
              <LazyInlineDiffView
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
  isRunning,
  title,
  titleParts,
}: {
  isRunning: boolean;
  title: string;
  titleParts?: { prefix: string; path: string; filePath?: boolean };
}) {
  const shimmerRef = useShimmer<HTMLElement>(isRunning);
  const displayTitle = normalizeCallTitleSeparator(title);
  const displayPrefix = titleParts ? normalizeCallTitleSeparator(titleParts.prefix) : undefined;
  const shimmerData = isRunning ? { "data-poracode-shimmer-text": displayTitle } : {};
  if (titleParts) {
    // Shimmer only the stable prefix ("Edit · "), never the path: the path can
    // change while running (absolute → project-relative), and mutating text
    // under `background-clip: text` leaves ghosted glyphs (see
    // .poracode-thinking-text in styles.css).
    return (
      <code className="flex min-w-0 items-baseline overflow-hidden font-mono !text-[color:var(--muted)]">
        <span
          ref={shimmerRef}
          className={`shrink-0 whitespace-pre ${isRunning ? "poracode-thinking-text" : ""}`}
          {...(isRunning ? { "data-poracode-shimmer-text": displayPrefix } : {})}
        >
          {displayPrefix}
        </span>
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
    <code
      ref={shimmerRef}
      className={`min-w-0 truncate font-mono !text-[color:var(--muted)] ${isRunning ? "poracode-thinking-text" : ""}`}
      {...shimmerData}
    >
      {displayTitle}
    </code>
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
  const rightLabel: ReactNode = isRunning ? undefined : isError ? (
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
  const rightLabel: ReactNode = isRunning ? undefined : isErrorExit ? <ErrorIcon /> : undefined;
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
  const rightLabel: ReactNode = isRunning ? undefined : isError ? (
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
  const display = deriveWebSearchDisplay(payload, t);
  const sections: ToolCallSection[] =
    isExpanded && display.hasDetails
      ? [
          { label: "query", part: extractAcpArgsPart(payload) },
          { label: "results", part: extractAcpResultPart(payload) },
        ]
      : [];
  const isRunning = item.state !== "completed";
  // Keep the `resultCount` binding: it is the Lingui placeholder name baked
  // into the `{resultCount, plural, …}` msgid across all catalogs.
  const resultCount = display.resultCount;
  const rightLabel: ReactNode = isRunning ? undefined : resultCount != null ? (
    <Plural value={resultCount} one="# result" other="# results" />
  ) : undefined;
  return {
    Icon: Globe,
    title: display.title,
    ...(display.parts ? { titleParts: display.parts } : {}),
    rightLabel,
    rightLabelClassName: "text-[color:var(--muted)]",
    hasDetails: display.hasDetails,
    sections,
  };
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
