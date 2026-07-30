import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Command, File as FileIcon, LoaderCircle, Settings, Zap } from "lucide-react";
import type { Project, ProjectTreeEntry, Thread } from "@/shared/contracts";
import type { SettingsSearchResult } from "@/renderer/views/SettingsOverlay/parts/settingsSearchIndex";
import type { AppCommand } from "./registry";
import type { EverythingSearchCategory } from "./everythingSearch";
import { EverythingSearchResultRow, EverythingSearchThreadRow } from "./EverythingSearchResultRow";

export type EverythingSearchResult =
  | { key: string; kind: "thread"; thread: Thread; project: Project | undefined }
  | {
      key: string;
      kind: "command" | "action";
      command: AppCommand;
      title: string;
      subtitle: string;
      shortcut: string;
    }
  | { key: string; kind: "setting"; setting: SettingsSearchResult }
  | { key: string; kind: "file"; entry: ProjectTreeEntry };

export interface EverythingSearchSection {
  category: Exclude<EverythingSearchCategory, "all">;
  label: string;
  results: EverythingSearchResult[];
}

export function EverythingSearchResults(props: {
  sections: EverythingSearchSection[];
  activeIndex: number;
  loading: boolean;
  emptyMessage?: string | undefined;
  onActivate: (result: EverythingSearchResult) => void;
  onHover: (index: number) => void;
}) {
  const { t } = useLingui();
  const listRef = useRef<HTMLDivElement | null>(null);
  const results = props.sections.flatMap((section) => section.results);
  const activeResultKey = results[props.activeIndex]?.key;

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-search-index="${props.activeIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [props.activeIndex, activeResultKey]);

  let nextSectionStart = 0;
  const sectionsWithStart = props.sections.map((section) => {
    const start = nextSectionStart;
    nextSectionStart += section.results.length;
    return { section, start };
  });

  return (
    <div
      ref={listRef}
      id="everything-search-results"
      role="listbox"
      aria-label={t`Search`}
      className="max-h-[min(560px,65vh)] overflow-y-auto p-1.5"
    >
      {results.length > 0 ? (
        sectionsWithStart.map(({ section, start }) => {
          if (section.results.length === 0) return null;
          return (
            <div key={section.category} className="flex flex-col gap-0.5 pb-1 last:pb-0">
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/70">
                {section.label}
              </div>
              {section.results.map((result, sectionIndex) => {
                const index = start + sectionIndex;
                if (result.kind === "thread") {
                  return (
                    <EverythingSearchThreadRow
                      key={result.key}
                      thread={result.thread}
                      project={result.project}
                      index={index}
                      isSelected={index === props.activeIndex}
                      onActivate={() => props.onActivate(result)}
                      onHover={() => props.onHover(index)}
                    />
                  );
                }
                return (
                  <EverythingSearchResultRow
                    key={result.key}
                    icon={resultIcon(result)}
                    title={resultTitle(result)}
                    subtitle={resultSubtitle(result, t`Settings`)}
                    shortcut={
                      result.kind === "command" || result.kind === "action"
                        ? result.shortcut
                        : undefined
                    }
                    index={index}
                    isSelected={index === props.activeIndex}
                    onActivate={() => props.onActivate(result)}
                    onHover={() => props.onHover(index)}
                  />
                );
              })}
            </div>
          );
        })
      ) : props.loading ? (
        <div className="flex h-24 items-center justify-center text-muted">
          <LoaderCircle className="size-4 animate-spin" />
        </div>
      ) : (
        <div className="px-3 py-8 text-center text-sm text-muted">
          {props.emptyMessage ?? <Trans>No results</Trans>}
        </div>
      )}
    </div>
  );
}

function resultIcon(result: Exclude<EverythingSearchResult, { kind: "thread" }>): ReactNode {
  if (result.kind === "command") return <Command />;
  if (result.kind === "action") return <Zap />;
  if (result.kind === "setting") return <Settings />;
  return <FileIcon />;
}

function resultTitle(result: Exclude<EverythingSearchResult, { kind: "thread" }>): string {
  if (result.kind === "command" || result.kind === "action") return result.title;
  if (result.kind === "setting") return result.setting.title;
  if (result.kind !== "file") return "";
  return result.entry.name;
}

function resultSubtitle(
  result: Exclude<EverythingSearchResult, { kind: "thread" }>,
  settingsLabel: string,
): string {
  if (result.kind === "command" || result.kind === "action") return result.subtitle;
  if (result.kind === "setting") return result.setting.snippet ?? settingsLabel;
  if (result.kind !== "file") return "";
  return result.entry.path;
}
