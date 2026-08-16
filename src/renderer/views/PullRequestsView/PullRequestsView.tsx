import { Button, Checkbox, Input, Popover, TextField } from "@heroui/react";
import { ArrowRight, Funnel, GitPullRequest, Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useShallow } from "zustand/shallow";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Project, PullRequestSummary } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { MobileMachineToolbar } from "@/renderer/components/common/MobileMachineToolbar";
import { useProjectRemoteServerLookup } from "@/renderer/components/common/ProjectRemoteServer";
import { MobilePageHeaderActions } from "@/renderer/components/layout/MobilePageHeaderActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { useAppStore } from "@/renderer/state/appStore";
import { useWorkspaceProjectFilter } from "@/renderer/state/workspaceSelectors";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  getPrStatusTone,
  isPrBlockedOnlyByPendingChecks,
  isPrMergeBlocked,
  PR_TONE_BG_CLASS,
  PR_TONE_TEXT_CLASS,
} from "@/renderer/utils/prStatus";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { dedupePrProjects, repoIdentityKey } from "./prProjectDedupe";

type FilterMode = "all" | "reviewing" | "authored";

interface LoadedProject {
  project: Project;
  pullRequests: PullRequestSummary[];
  viewerLogin?: string;
}

interface ProjectFailure {
  project: Project;
  message: string;
}

interface PullRequestEntry {
  project: Project;
  summary: PullRequestSummary;
}

export function PullRequestsView(
  props: {
    readonly remoteDesktopId?: string;
    readonly onRemoteDesktopChange?: (desktopId: string | null) => void;
  } = {},
) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const remoteServerFor = useProjectRemoteServerLookup();
  // Scoped to the active workspace, so this view agrees with the sidebar about
  // which projects exist right now.
  const isInWorkspace = useWorkspaceProjectFilter();
  const activeProjects = useAppStore(
    useShallow((state) =>
      state.projects.filter(
        (project) =>
          !project.disabled &&
          !isHomeProject(project) &&
          isInWorkspace(project) &&
          (!props.remoteDesktopId || project.remoteServerId === props.remoteDesktopId),
      ),
    ),
  );
  // Two checkouts of the same origin (typically a local clone plus the same
  // clone mirrored from a remote desktop) return identical `gh pr list` rows, so
  // only one of them is queried — the local one when there is one.
  const prProjects = useGitStore(
    useShallow((state) =>
      dedupePrProjects(activeProjects, (project) =>
        repoIdentityKey(state.statuses[project.id]?.remoteInfo),
      ),
    ),
  );
  const prReviewOpen = usePanelStore((state) => state.prReviewContext !== null);
  const [loadedProjects, setLoadedProjects] = useState<LoadedProject[]>([]);
  const [failures, setFailures] = useState<ProjectFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(() => new Set());
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (prReviewOpen) return;

    let cancelled = false;
    setLoadedProjects([]);
    setFailures([]);
    setLoading(prProjects.length > 0);

    const requests = prProjects.map((project) =>
      readBridge()
        .ghListPullRequests({ projectLocation: project.location })
        .then(
          (result) => {
            if (cancelled) return;
            setLoadedProjects((current) => [
              ...current,
              {
                project,
                pullRequests: result.pullRequests,
                ...(result.viewerLogin ? { viewerLogin: result.viewerLogin } : {}),
              },
            ]);
          },
          (reason) => {
            if (cancelled) return;
            setFailures((current) => [...current, { project, message: friendlyError(reason) }]);
          },
        ),
    );

    void Promise.allSettled(requests).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [prProjects, prReviewOpen, refreshVersion]);

  const accountLogins = [
    ...new Set(
      loadedProjects.flatMap((loaded) => (loaded.viewerLogin ? [loaded.viewerLogin] : [])),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEntries: PullRequestEntry[] = [];

  for (const loaded of loadedProjects) {
    if (hiddenProjectIds.has(loaded.project.id)) continue;
    if (loaded.viewerLogin && hiddenAccounts.has(loaded.viewerLogin)) continue;

    for (const summary of loaded.pullRequests) {
      if (filter === "reviewing" && !summary.reviewRequested) continue;
      if (filter === "authored" && summary.pr.viewerDidAuthor !== true) continue;
      if (
        normalizedQuery &&
        ![
          summary.pr.title,
          summary.repository,
          summary.headBranch,
          summary.author?.login ?? "",
          loaded.project.name,
          String(summary.pr.number),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      ) {
        continue;
      }
      visibleEntries.push({
        project: loaded.project,
        summary,
      });
    }
  }

  visibleEntries.sort((left, right) => {
    const updated = right.summary.pr.updatedAt.localeCompare(left.summary.pr.updatedAt);
    if (updated !== 0) return updated;
    const repository = left.summary.repository.localeCompare(right.summary.repository);
    if (repository !== 0) return repository;
    const project = left.project.id.localeCompare(right.project.id);
    if (project !== 0) return project;
    return right.summary.pr.number - left.summary.pr.number;
  });

  const reviewingEntries: PullRequestEntry[] = [];
  const authoredEntries: PullRequestEntry[] = [];
  const otherEntries: PullRequestEntry[] = [];
  if (filter === "all") {
    for (const entry of visibleEntries) {
      if (entry.summary.reviewRequested) reviewingEntries.push(entry);
      else if (entry.summary.pr.viewerDidAuthor === true) authoredEntries.push(entry);
      else otherEntries.push(entry);
    }
  }
  const totalPullRequests = loadedProjects.reduce(
    (total, loaded) => total + loaded.pullRequests.length,
    0,
  );
  const hasActiveFilters = hiddenProjectIds.size > 0 || hiddenAccounts.size > 0;
  const filterControls = (
    <div className="max-h-[55dvh] space-y-3 overflow-y-auto px-1 py-2">
      <FilterGroup title={<Trans>Projects</Trans>}>
        {prProjects.map((project) => (
          <Checkbox
            key={project.id}
            className="block"
            isSelected={!hiddenProjectIds.has(project.id)}
            onChange={(visible) =>
              setHiddenProjectIds((current) => {
                const next = new Set(current);
                if (visible) next.delete(project.id);
                else next.add(project.id);
                return next;
              })
            }
          >
            <Checkbox.Content className="w-full min-w-0">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs text-foreground">{project.name}</span>
                {remoteServerFor(project).serverName ? (
                  <span className="truncate text-[10px] text-muted/60">
                    {remoteServerFor(project).serverName}
                  </span>
                ) : null}
              </span>
            </Checkbox.Content>
          </Checkbox>
        ))}
      </FilterGroup>
      {accountLogins.length > 0 ? (
        <FilterGroup title={<Trans>Accounts</Trans>}>
          {accountLogins.map((login) => (
            <Checkbox
              key={login}
              className="block"
              isSelected={!hiddenAccounts.has(login)}
              onChange={(visible) =>
                setHiddenAccounts((current) => {
                  const next = new Set(current);
                  if (visible) next.delete(login);
                  else next.add(login);
                  return next;
                })
              }
            >
              <Checkbox.Content className="w-full min-w-0">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="truncate text-xs text-foreground">{login}</span>
              </Checkbox.Content>
            </Checkbox>
          ))}
        </FilterGroup>
      ) : null}
    </div>
  );

  function openPullRequest(entry: PullRequestEntry) {
    const { project, summary } = entry;
    const prKey = buildBranchNamePrKey(project.id, summary.headBranch);
    const gitState = useGitStore.getState();
    const projectWorktrees = gitState.worktrees[project.id] ?? [];
    const matchingWorktree = projectWorktrees.find(
      (worktree) => !worktree.isMain && worktree.branch === summary.headBranch,
    );

    gitState.setPrData(prKey, summary.pr);
    usePanelStore.getState().setPrReviewContext({
      projectId: project.id,
      prNumber: summary.pr.number,
      prKey,
      ...(matchingWorktree ? { worktreePath: matchingWorktree.path } : {}),
      skipLocalSync: true,
    });
  }

  return (
    <SettingsPage
      title={t`Pull requests`}
      description={t`Review and track work across your GitHub accounts.`}
      bodyClassName="space-y-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className={`relative min-w-0 flex-1 ${compact ? "hidden" : ""}`}>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 z-10 size-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <TextField aria-label={t`Search pull requests`} value={query} onChange={setQuery}>
            <Input className="pl-9" placeholder={t`Search pull requests`} />
          </TextField>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LightballTabs<FilterMode>
            tabs={[
              { id: "all", label: t`All` },
              { id: "reviewing", label: t`Reviewing` },
              { id: "authored", label: t`Authored` },
            ]}
            active={filter}
            onChange={setFilter}
            ariaLabel={t`Pull request category`}
          />
          {!compact ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={loading}
              aria-label={t`Refresh`}
              className="shrink-0"
              onPress={() => setRefreshVersion((current) => current + 1)}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          ) : null}
          {!compact ? (
            <Popover>
              <Popover.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Filter pull requests`}
                  className="relative shrink-0"
                >
                  <Funnel className="size-4" />
                  {hasActiveFilters ? (
                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" />
                  ) : null}
                </Button>
              </Popover.Trigger>
              <Popover.Content placement="bottom end" className="w-72 p-0">
                <Popover.Dialog className="overflow-hidden !p-0">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-semibold text-foreground">
                      <Trans>Filters</Trans>
                    </span>
                    {hasActiveFilters ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setHiddenProjectIds(new Set());
                          setHiddenAccounts(new Set());
                        }}
                      >
                        <Trans>Show all</Trans>
                      </Button>
                    ) : null}
                  </div>
                  <div className="px-3">{filterControls}</div>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          ) : null}
        </div>
      </div>

      {compact ? (
        <>
          <MobilePageHeaderActions>
            <MobileCircleButton
              aria-label={t`Search pull requests`}
              onPress={() => setSearchOpen(true)}
            >
              <Search className="size-5" />
            </MobileCircleButton>
          </MobilePageHeaderActions>
          {props.remoteDesktopId && props.onRemoteDesktopChange ? (
            <MobileMachineToolbar
              desktopId={props.remoteDesktopId}
              onDesktopChange={props.onRemoteDesktopChange}
              leading={
                <MobileCircleButton
                  aria-label={t`Filter pull requests`}
                  onPress={() => setFiltersOpen(true)}
                >
                  <Funnel className="size-4" />
                  {hasActiveFilters ? (
                    <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent" />
                  ) : null}
                </MobileCircleButton>
              }
              trailing={
                <MobileCircleButton
                  aria-label={t`Refresh`}
                  isDisabled={loading}
                  onPress={() => setRefreshVersion((current) => current + 1)}
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </MobileCircleButton>
              }
            />
          ) : null}
          {searchOpen ? (
            <BottomSheet label={t`Search pull requests`} onClose={() => setSearchOpen(false)}>
              <div className="px-1 pb-2 pt-1">
                <TextField aria-label={t`Search pull requests`} value={query} onChange={setQuery}>
                  <Input placeholder={t`Search pull requests`} />
                </TextField>
              </div>
            </BottomSheet>
          ) : null}
          {filtersOpen ? (
            <BottomSheet label={t`Filters`} onClose={() => setFiltersOpen(false)}>
              <div className="flex items-center justify-end px-1">
                {hasActiveFilters ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setHiddenProjectIds(new Set());
                      setHiddenAccounts(new Set());
                    }}
                  >
                    <Trans>Show all</Trans>
                  </Button>
                ) : null}
              </div>
              {filterControls}
            </BottomSheet>
          ) : null}
        </>
      ) : null}

      {failures.map((failure) => (
        <div
          key={failure.project.id}
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs"
        >
          <p className="font-medium text-danger">
            <Trans>Could not load pull requests for {failure.project.name}.</Trans>
          </p>
          <p className="mt-0.5 text-muted">{failure.message}</p>
        </div>
      ))}

      {visibleEntries.length > 0 ? (
        <div className="space-y-5">
          {filter === "all" ? (
            <>
              <PullRequestSection
                title={<Trans>Reviewing</Trans>}
                entries={reviewingEntries}
                onOpen={openPullRequest}
              />
              <PullRequestSection
                title={<Trans>Authored</Trans>}
                entries={authoredEntries}
                onOpen={openPullRequest}
              />
              <PullRequestSection
                title={<Trans>Other</Trans>}
                entries={otherEntries}
                onOpen={openPullRequest}
              />
            </>
          ) : (
            <PullRequestRows entries={visibleEntries} onOpen={openPullRequest} />
          )}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12 text-muted">
          <Loader2 className="size-5 animate-spin" aria-label={t`Loading pull requests`} />
        </div>
      ) : (
        <div className="py-12 text-center text-muted">
          <GitPullRequest className="mx-auto mb-3 size-8" />
          <p className="text-sm font-medium text-foreground">
            {prProjects.length === 0 ? (
              <Trans>Add a project to see pull requests.</Trans>
            ) : totalPullRequests === 0 && failures.length === 0 ? (
              <Trans>No pull requests found.</Trans>
            ) : (
              <Trans>No matching pull requests.</Trans>
            )}
          </p>
        </div>
      )}
    </SettingsPage>
  );
}

function FilterGroup(props: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        {props.title}
      </h2>
      <div className="space-y-1">{props.children}</div>
    </section>
  );
}

function PullRequestSection(props: {
  title: ReactNode;
  entries: PullRequestEntry[];
  onOpen: (entry: PullRequestEntry) => void;
}) {
  if (props.entries.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-xs font-semibold text-muted">{props.title}</h2>
      <PullRequestRows entries={props.entries} onOpen={props.onOpen} />
    </section>
  );
}

function PullRequestRows(props: {
  entries: PullRequestEntry[];
  onOpen: (entry: PullRequestEntry) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="poracode-pr-rows overflow-hidden rounded-xl border border-[var(--hairline)] bg-surface-secondary/30">
      {props.entries.map((entry) => {
        const { project, summary } = entry;
        const tone = getPrStatusTone(summary.pr.state, summary.pr.checksStatus, summary.pr);
        const isPendingChecksBlock = isPrBlockedOnlyByPendingChecks(
          summary.pr.checksStatus,
          summary.pr,
        );
        const statusLabel =
          summary.pr.state === "draft"
            ? t`Draft`
            : summary.pr.state === "merged"
              ? t`Merged`
              : summary.pr.state === "closed"
                ? t`Closed`
                : isPendingChecksBlock
                  ? t`Checks pending`
                  : isPrMergeBlocked(summary.pr)
                    ? t`Merging is blocked`
                    : tone === "danger"
                      ? t`Checks failed`
                      : tone === "warning"
                        ? t`Checks pending`
                        : summary.pr.checksStatus
                          ? t`Checks passed`
                          : t`Open`;
        return (
          <button
            key={`${project.id}:${summary.pr.number}`}
            type="button"
            className="poracode-pr-row group flex w-full items-center gap-3 border-b border-[var(--hairline)] px-3 py-3 text-left outline-none transition-colors last:border-b-0 hover:bg-default-100/60 focus-visible:bg-default-100/60"
            onClick={() => props.onOpen(entry)}
          >
            <span className="relative shrink-0" aria-hidden>
              <GitPullRequest className={`size-4 ${PR_TONE_TEXT_CLASS[tone]}`} />
              <span
                className={`absolute -right-1 -bottom-1 size-1.5 rounded-full ring-2 ring-surface-secondary ${PR_TONE_BG_CLASS[tone]}`}
              />
            </span>
            <span className="sr-only">{statusLabel}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {summary.pr.title}
              </span>
              <span className="poracode-pr-row-meta mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                {summary.author ? (
                  summary.author.avatarUrl ? (
                    <img
                      src={summary.author.avatarUrl}
                      alt=""
                      className="poracode-pr-author size-4 shrink-0 rounded-full"
                    />
                  ) : (
                    <span className="poracode-pr-author flex size-4 shrink-0 items-center justify-center rounded-full bg-default-100 text-[9px] font-semibold text-foreground">
                      {summary.author.login.slice(0, 1).toUpperCase()}
                    </span>
                  )
                ) : null}
                {summary.author ? (
                  <span className="poracode-pr-author truncate">{summary.author.login}</span>
                ) : null}
                <span className="poracode-pr-author text-muted/40">·</span>
                <span className="truncate">{summary.repository}</span>
                <span className="text-muted/40">·</span>
                <span className="flex min-w-0 items-center gap-1 font-mono text-[11px]">
                  <span className="truncate">{summary.headBranch}</span>
                  <ArrowRight className="size-3 shrink-0 text-muted/60" aria-hidden />
                  <span className="truncate">{summary.pr.baseBranch}</span>
                </span>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted">
              <RelativeTime iso={summary.pr.updatedAt} />
              <span className="flex items-center gap-1 font-medium tabular-nums">
                <span className="text-success">+{summary.additions}</span>
                <span className="text-danger">-{summary.deletions}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
