import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowRight,
  Command,
  LoaderCircle,
  MessageSquare,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { FileIcon } from "@/renderer/components/common/FileIcon";
import type { SearchQuery } from "@/shared/searchMatching";
import { EverythingSearchResultRow, EverythingSearchThreadRow } from "./EverythingSearchResultRow";
import {
  CATEGORY_RESULT_LIMIT,
  type EverythingSearchResult,
  type EverythingSearchSection,
} from "./everythingSearchSections";
import { FILE_SEARCH_LIMIT } from "./useEverythingFileSearch";

export function EverythingSearchResults(props: {
  sections: EverythingSearchSection[];
  query: SearchQuery;
  activeIndex: number;
  loading: boolean;
  loadingLabel?: string;
  failed: boolean;
  messagesFailed: boolean;
  messagesHaveMore: boolean;
  emptyMessage: string | undefined;
  onRetry: () => void;
  onActivate: (result: EverythingSearchResult) => void;
  onHover: (index: number) => void;
}) {
  const { t } = useLingui();
  const listRef = useRef<HTMLDivElement | null>(null);
  const results = props.sections.flatMap((section) => section.results);
  const activeResultKey = results[props.activeIndex]?.key;

  useEffect(() => {
    if (!activeResultKey) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-search-index="${props.activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [props.activeIndex, activeResultKey]);

  let nextSectionStart = 0;
  const sectionsWithStart: { section: EverythingSearchSection; start: number }[] = [];
  for (const section of props.sections) {
    const start = nextSectionStart;
    nextSectionStart += section.results.length;
    sectionsWithStart.push({ section, start });
  }
  const capped =
    props.sections.some((section) =>
      section.category === "files"
        ? section.total >= FILE_SEARCH_LIMIT
        : section.total > CATEGORY_RESULT_LIMIT ||
          (section.category === "messages" &&
            props.messagesHaveMore &&
            section.total >= CATEGORY_RESULT_LIMIT),
    ) && props.sections.length === 1;

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
      <div
        id="everything-search-results"
        role="listbox"
        aria-label={t`Search results`}
        aria-busy={props.loading}
      >
        {sectionsWithStart.map(({ section, start }) =>
          section.results.length > 0 ? (
            <div
              key={section.category}
              role="group"
              aria-labelledby={`search-heading-${section.category}`}
              className="flex flex-col gap-0.5 pb-2 last:pb-0"
            >
              <div
                id={`search-heading-${section.category}`}
                className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted"
              >
                {section.label}
                <span className="font-normal tabular-nums tracking-normal opacity-70">
                  {section.total}
                  {(section.category === "files" && section.total >= FILE_SEARCH_LIMIT) ||
                  (section.category === "messages" && props.messagesHaveMore)
                    ? "+"
                    : ""}
                </span>
              </div>
              {section.results.map((result, sectionIndex) => {
                const index = start + sectionIndex;
                const row = {
                  index,
                  query: props.query,
                  isSelected: index === props.activeIndex,
                  onActivate: () => props.onActivate(result),
                  onHover: () => props.onHover(index),
                };
                return result.kind === "thread" ? (
                  <EverythingSearchThreadRow
                    key={result.key}
                    thread={result.thread}
                    project={result.project}
                    {...row}
                  />
                ) : (
                  <EverythingSearchResultRow
                    key={result.key}
                    icon={resultIcon(result)}
                    title={
                      result.kind === "more"
                        ? t`Show more`
                        : result.kind === "message" && result.hit.archived
                          ? `${resultTitle(result)} · ${t`Archived`}`
                          : resultTitle(result)
                    }
                    subtitle={resultSubtitle(result, t`Settings`)}
                    {...(result.kind === "message" ? { wrapSubtitle: true } : {})}
                    {...(result.kind === "command" || result.kind === "action"
                      ? { shortcut: result.shortcut }
                      : {})}
                    {...row}
                  />
                );
              })}
            </div>
          ) : null,
        )}
      </div>
      {results.length === 0 && !props.loading && !props.failed && !props.messagesFailed ? (
        <div
          className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted"
          role="status"
        >
          <Search aria-hidden="true" className="mb-1 size-6 opacity-40" />
          <span>{props.emptyMessage ?? t`No results`}</span>
          {!props.emptyMessage && props.query.terms.length > 0 ? (
            <span className="text-xs">
              <Trans>Try different keywords or choose a category.</Trans>
            </span>
          ) : null}
        </div>
      ) : null}
      {props.loading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-4 text-xs text-muted"
        >
          <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
          {props.loadingLabel ?? t`Searching files…`}
        </div>
      ) : null}
      {props.failed ? (
        <div
          role="status"
          className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted"
        >
          <Trans>File search unavailable</Trans>
          <Button type="button" size="sm" variant="ghost" onPress={props.onRetry}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {capped ? (
        <p role="status" className="px-3 py-3 text-xs text-muted">
          <Trans>Showing the first {CATEGORY_RESULT_LIMIT} results. Refine your search.</Trans>
        </p>
      ) : null}
    </div>
  );
}

function resultIcon(result: Exclude<EverythingSearchResult, { kind: "thread" }>): ReactNode {
  if (result.kind === "message") return <MessageSquare />;
  if (result.kind === "command") return <Command />;
  if (result.kind === "action") return <Zap />;
  if (result.kind === "setting") return <Settings />;
  if (result.kind === "more") return <ArrowRight />;
  if (result.kind === "file") return <FileIcon path={result.entry.path} />;
  return null;
}

function resultTitle(result: Exclude<EverythingSearchResult, { kind: "thread" }>): string {
  if (result.kind === "message")
    return [result.hit.sourceLabel, result.hit.projectName, result.hit.title]
      .filter(Boolean)
      .join(" · ");
  if (result.kind === "command" || result.kind === "action") return result.title;
  if (result.kind === "setting") return result.setting.title;
  if (result.kind === "file") return result.entry.name;
  return "";
}

function resultSubtitle(
  result: Exclude<EverythingSearchResult, { kind: "thread" }>,
  settingsLabel: string,
): string {
  if (result.kind === "message") return result.hit.excerpt;
  if (result.kind === "command" || result.kind === "action") return result.subtitle;
  if (result.kind === "setting") return result.setting.snippet ?? settingsLabel;
  if (result.kind === "file") return result.entry.path;
  return result.kind === "more" ? result.label : "";
}
