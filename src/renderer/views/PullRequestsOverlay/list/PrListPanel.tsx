import { useState, type ReactNode } from "react";
import { Input, TextField } from "@heroui/react";
import {
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  GitPullRequest,
  ListFilter,
  Search,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { sidebarRowClass } from "@/renderer/components/common/SidebarButton";
import {
  sidebarGroupHeaderButtonClass,
  sidebarGroupHeaderRowClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useBrowserReviewOnline } from "@/renderer/browser/offlineReviewCache";
import { PrListRow } from "./PrListRow";
import { PrCompactListBar } from "./PrCompactListBar";
import { PrFilterMenu } from "./PrListMenus";
import {
  filterAndSortEntries,
  findReferencedEntry,
  groupEntries,
  pullRequestEntryKey,
  type PullRequestEntry,
} from "./prListModel";
import { usePrListController, type PrListController } from "./usePrListController";

type GroupId = "authored" | "reviewing" | "others";

type PrListPanelProps = {
  remoteDesktopId?: string | undefined;
  /**
   * Compact layout only: with `remoteDesktopId`, the bottom row shows the machine
   * picker between the filter and refresh actions. Without both, it has no picker.
   */
  onRemoteDesktopChange?: ((desktopId: string | null) => void) | undefined;
  selectedKey: string | null;
  onOpen: (entry: PullRequestEntry) => void;
  hideTitle?: boolean;
  controller?: PrListController;
};

/**
 * The review list: search (with `label:`, `author:` and `is:draft`), sort,
 * filters and the authored / review-requested / other groups. Used as the
 * overlay sidebar and as the compact list page.
 */
export function PrListPanel(props: PrListPanelProps) {
  return props.controller ? (
    <PrListPanelView {...props} controller={props.controller} />
  ) : (
    <PrListPanelWithController {...props} />
  );
}

function PrListPanelWithController(props: PrListPanelProps) {
  const controller = usePrListController({ remoteDesktopId: props.remoteDesktopId });
  return <PrListPanelView {...props} controller={controller} />;
}

function PrListPanelView(props: PrListPanelProps & { controller: PrListController }) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const browserOnline = useBrowserReviewOnline();
  const { controller } = props;
  const { data, filterControls, filterCount, clearFilters } = controller;
  const { filters, sort, state } = controller;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<GroupId>>(() => new Set());
  const [referenceMiss, setReferenceMiss] = useState(false);

  const visible = filterAndSortEntries(data.entries, {
    query,
    filters,
    sort,
    accountKey: data.accountKey,
  });
  const groups = groupEntries(visible);
  const repositories = new Set(data.entries.map((entry) => entry.summary.repository));

  function submitSearch() {
    const referenced = findReferencedEntry(query, data.entries);
    if (referenced && referenced !== "ambiguous") {
      setQuery("");
      props.onOpen(referenced);
      return;
    }
    setReferenceMiss(/^#\d+$/.test(query.trim()) || /^https?:\/\//i.test(query.trim()));
  }

  function toggleGroup(id: GroupId) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sections: { id: GroupId; title: ReactNode; entries: PullRequestEntry[] }[] = [
    { id: "authored", title: <Trans>Authored by me</Trans>, entries: groups.authored },
    { id: "reviewing", title: <Trans>Needs my review</Trans>, entries: groups.reviewing },
    { id: "others", title: <Trans>Others</Trans>, entries: groups.others },
  ];

  const filterSummary =
    state === "open"
      ? t`Open pull requests`
      : state === "merged"
        ? t`Merged pull requests`
        : state === "closed"
          ? t`Closed`
          : t`All pull requests`;
  const filterCountLabel = filterCount === 1 ? t`1 filter` : t`${filterCount} filters`;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {compact || props.hideTitle ? null : (
        <div className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-1">
          <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-foreground">
            <Trans>Pull requests</Trans>
          </h2>
        </div>
      )}
      {compact ? null : (
        <div className="shrink-0 px-2 pb-1">
          <PrFilterMenu
            {...filterControls}
            onClearFilters={clearFilters}
            triggerClassName={`${sidebarRowClass({ size: "xs" })} h-8`}
            triggerLabel={
              filterCount > 0 ? `${filterSummary} · ${filterCountLabel}` : filterSummary
            }
            trigger={
              <>
                <ListFilter className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-left">
                  {filterSummary}
                  {filterCount > 0 ? (
                    <span className="text-muted/70">
                      {" · "}
                      {filterCountLabel}
                    </span>
                  ) : null}
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden />
              </>
            }
          />
        </div>
      )}
      <div className={`relative shrink-0 pb-2 ${compact ? "px-[var(--m-page-inline)]" : "px-2"}`}>
        <div className="relative">
          <Search
            aria-hidden
            className={`pointer-events-none absolute z-10 size-3.5 text-muted ${
              compact
                ? "left-[calc(var(--m-page-inline)+0.75rem)] top-1/2 -translate-y-[calc(50%+4px)]"
                : "left-2.5 top-1/2 -translate-y-1/2"
            }`}
          />
          <TextField
            aria-label={t`Search or paste a pull request link`}
            value={query}
            onChange={(value) => {
              setQuery(value);
              setReferenceMiss(false);
            }}
          >
            <Input
              className={compact ? "h-10 pl-8 text-sm" : "h-8 pl-8 text-xs"}
              placeholder={t`Search or paste a PR link`}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
                if (event.key === "Escape" && query) {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
            />
          </TextField>
        </div>
        {referenceMiss ? (
          <p role="status" className="px-1 pt-1 text-[11px] text-muted">
            <Trans>That pull request is not in this list. Try another state filter.</Trans>
          </p>
        ) : null}
      </div>
      {!browserOnline ? (
        <p role="status" className="shrink-0 px-3 pb-2 text-[11px] text-muted">
          <Trans>Offline</Trans>
        </p>
      ) : null}
      <div
        className={
          compact
            ? "min-h-0 flex-1 overflow-y-auto px-[var(--m-page-inline)] pb-[calc(var(--m-floating-control-height)+1.5rem+env(safe-area-inset-bottom))]"
            : "min-h-0 flex-1 overflow-y-auto px-2 pb-3"
        }
      >
        {data.failures.map((failure) => (
          <div
            key={failure.project.id}
            role="alert"
            className="mb-2 rounded-lg border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px]"
          >
            <p className="font-medium text-danger">
              <Trans>Could not load pull requests for {failure.project.name}.</Trans>
            </p>
            <p className="mt-0.5 text-muted">{failure.message}</p>
          </div>
        ))}
        {visible.length > 0 ? (
          sections.map((section) =>
            section.entries.length === 0 ? null : (
              <section key={section.id} className="mb-2">
                <div className={`${sidebarGroupHeaderRowClass} ${compact ? "" : "py-1"}`}>
                  <button
                    type="button"
                    aria-expanded={!collapsed.has(section.id)}
                    className={`${sidebarGroupHeaderButtonClass} ${
                      compact
                        ? "poracode-sidebar-touch-row min-h-9"
                        : "transition-colors hover:text-foreground"
                    }`}
                    onClick={() => toggleGroup(section.id)}
                  >
                    {collapsed.has(section.id) ? (
                      <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                    )}
                    {section.title}
                    <span className="font-normal tabular-nums text-muted/70">
                      {section.entries.length}
                    </span>
                  </button>
                </div>
                {collapsed.has(section.id) ? null : (
                  <div className="space-y-0.5">
                    {section.entries.map((entry) => {
                      const key = pullRequestEntryKey(entry);
                      return (
                        <PrListRow
                          key={key}
                          entry={entry}
                          selected={props.selectedKey === key}
                          showRepository={repositories.size > 1}
                          onOpen={() => props.onOpen(entry)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            ),
          )
        ) : data.loading ? (
          <div
            role="status"
            aria-label={t`Loading pull requests`}
            className="flex justify-center py-10"
          >
            <PixelLoader size="md" />
          </div>
        ) : (
          <div className="px-3 py-10 text-center text-muted">
            <GitPullRequest className="mx-auto mb-2 size-6" aria-hidden />
            <p className="text-xs font-medium text-foreground">
              {data.projects.length === 0 ? (
                <Trans>Add a project to see pull requests.</Trans>
              ) : data.entries.length === 0 && data.failures.length === 0 ? (
                <Trans>No pull requests found.</Trans>
              ) : (
                <Trans>No matching pull requests.</Trans>
              )}
            </p>
          </div>
        )}
        {data.loading && visible.length > 0 ? (
          <div
            role="status"
            aria-label={t`Loading pull requests`}
            className="flex justify-center py-2"
          >
            <PixelLoader size="xs" />
          </div>
        ) : null}
      </div>
      {compact ? (
        <PrCompactListBar
          sort={sort}
          onSortChange={controller.setSort}
          filterControls={filterControls}
          loading={data.loading}
          onRefresh={data.refresh}
          onClearFilters={clearFilters}
          desktopId={props.remoteDesktopId}
          onDesktopChange={props.onRemoteDesktopChange}
        />
      ) : null}
    </div>
  );
}
