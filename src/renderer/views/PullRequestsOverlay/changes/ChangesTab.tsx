import { useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { usePrViewerDidAuthor } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { reviewCacheMatchesSource } from "@/renderer/utils/forgeReviews";
import type { PrCommitSummary, PrFile, PrReviewThread } from "@/shared/contracts";
import { useDiffTheme } from "../../GitReviewOverlay/parts/diffBuildClient";
import { usePrDetailNav } from "../detail/prDetailNav";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrLoadError } from "../parts/PrLoadError";
import { SubmitReviewPopover } from "../parts/SubmitReviewPopover";
import type { PrViewedState } from "../viewed/prViewedFiles";
import { ChangesDiffList } from "./ChangesDiffList";
import { ChangesFileTree } from "./ChangesFileTree";
import { DIFF_MODE, ChangesToolbar } from "./ChangesToolbar";
import { ChangesToolbarCompact } from "./ChangesToolbarCompact";
import {
  buildChangeEntries,
  createPathGrouper,
  filesFromDiff,
  NO_PATH_GROUPS,
  splitDiffOnce,
} from "./changesModel";
import { useReviewDrafts, type ReviewDraftComment } from "./prReviewDraftStore";
import { useCommitDiff } from "./useCommitDiff";
import { useDiffNavigation } from "./useDiffNavigation";
import { useElementWidth } from "./useElementWidth";

const NO_COMMITS: readonly PrCommitSummary[] = [];
const NO_PATCHES = new Map<string, string>();
const NO_FILES: PrFile[] = [];
const groupThreads = createPathGrouper<PrReviewThread>((thread) => thread.path);
const groupDrafts = createPathGrouper<ReviewDraftComment>((draft) => draft.path);
const TREE_WIDTH = 280;
const SPLIT_MIN_WIDTH = 760;
const TREE_MIN_WIDTH = 1000;

/** File tree, toolbar and diff of the review, or of one of its commits. */
export function ChangesTab() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const nav = usePrDetailNav();
  const compact = useCompactLayout();
  const theme = useDiffTheme();
  const viewerDidAuthor = usePrViewerDidAuthor(scope.prKey);

  const detailsSource = useGitStore((s) => s.prDetails[scope.cacheKey]?.source);
  const commits = useGitStore((s) => s.prDetails[scope.cacheKey]?.commits) ?? NO_COMMITS;
  const reviewThreads = useGitStore((s) => s.prDetails[scope.cacheKey]?.reviewThreads);
  const storedFiles = useGitStore((s) => s.prFiles[scope.cacheKey]);
  const storedDiff = useGitStore((s) => s.prDiffs[scope.cacheKey]);
  const drafts = useReviewDrafts(scope.draftKey);

  // null means "follow the width"; a manual toggle sticks until the user
  // changes it again.
  const [modeChoice, setModeChoice] = useState<number | null>(compact ? DIFF_MODE.Unified : null);
  const [treeChoice, setTreeChoice] = useState<boolean | null>(compact ? false : null);
  const [wrap, setWrap] = useState(false);
  const [hideWhitespace, setHideWhitespace] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const treeOpen = treeChoice ?? (width === 0 || width >= TREE_MIN_WIDTH);
  const diffWidth = width - (treeOpen ? TREE_WIDTH : 0);
  const mode =
    modeChoice ??
    (width === 0 || diffWidth >= SPLIT_MIN_WIDTH ? DIFF_MODE.Split : DIFF_MODE.Unified);

  // Files and diff belong to the source on screen, never to a previous one.
  const cacheMatchesSource = reviewCacheMatchesSource(scope.source, detailsSource);
  const capabilities = scope.scoped?.capabilities;
  const commit =
    capabilities?.commitDiffs === true &&
    nav.commitScope !== null &&
    commits.some((candidate) => candidate.oid === nav.commitScope)
      ? nav.commitScope
      : null;
  const commitDiff = useCommitDiff(commit);

  let files = cacheMatchesSource ? storedFiles : undefined;
  let patches = cacheMatchesSource ? splitDiffOnce(storedDiff ?? "") : NO_PATCHES;
  let status: "ready" | "loading" | "error" = !files && !scope.contentReady ? "loading" : "ready";
  let errorMessage = "";
  if (commit !== null) {
    const state = commitDiff.state;
    if (state.status === "ready") {
      patches = splitDiffOnce(state.diff);
      files = filesFromDiff(patches);
      status = "ready";
    } else {
      files = undefined;
      status = state.status === "error" ? "error" : "loading";
      if (state.status === "error") errorMessage = state.message;
    }
  }
  const entries = buildChangeEntries(files ?? NO_FILES, patches);

  // Viewed marks describe the whole review, not one commit.
  const viewStates = commit === null ? new Map<string, PrViewedState>() : null;
  if (viewStates) {
    for (const entry of entries) {
      viewStates.set(entry.file.path, scope.viewed.state(entry.file.path, entry.fingerprint));
    }
  }
  const navigation = useDiffNavigation({
    resetKey: `${scope.cacheKey}:${commit ?? ""}`,
    entries,
    viewStates,
    focusedFile: nav.focusedFile,
  });
  const viewedDisabled = scope.readOnly || scope.viewed.loading;

  function toggleViewed(path: string) {
    if (scope.readOnly || !cacheMatchesSource) return;
    const entry = entries.find((candidate) => candidate.file.path === path);
    if (!entry) return;
    if (viewStates?.get(path) === "viewed") scope.viewed.clear(path);
    else scope.viewed.mark(path, entry.fingerprint);
    navigation.followDefault(path);
  }

  const draftsAvailable = capabilities?.reviewDrafts === true;
  const commentsEnabled =
    draftsAvailable &&
    commit === null &&
    !scope.readOnly &&
    scope.headSha !== undefined &&
    viewerDidAuthor !== true;
  const commentsOffReason =
    draftsAvailable && commit !== null
      ? t`Line comments are only available on the whole review, not on a single commit.`
      : null;
  const submit = () => (
    <SubmitReviewPopover
      projectLocation={scope.location}
      prNumber={scope.prNumber}
      cacheKey={scope.cacheKey}
      prKey={scope.prKey}
      hidden={viewerDidAuthor === true}
      disabled={scope.readOnly}
      onSubmitted={scope.reload}
      triggerLabel={t`Review changes`}
    />
  );

  const diffArea =
    !files && scope.loadError ? (
      <PrLoadError message={scope.loadError} onRetry={scope.reload} />
    ) : status === "loading" ? (
      <div className="flex h-full min-h-48 items-center justify-center">
        <PixelLoader size="lg" />
      </div>
    ) : status === "error" ? (
      <PrLoadError message={errorMessage} onRetry={commitDiff.retry} />
    ) : entries.length === 0 ? (
      <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted">
        <Trans>No changes</Trans>
      </div>
    ) : (
      <ChangesDiffList
        entries={entries}
        options={{ mode, wrap, hideWhitespace, theme }}
        navigation={navigation}
        viewStates={viewStates}
        onToggleViewed={viewStates ? toggleViewed : null}
        viewedDisabled={viewedDisabled}
        viewedLabel={scope.viewedLabel}
        threadsByPath={commit === null ? groupThreads(reviewThreads) : NO_PATH_GROUPS}
        draftsByPath={commit === null && draftsAvailable ? groupDrafts(drafts) : NO_PATH_GROUPS}
        draftKey={scope.draftKey}
        headSha={scope.headSha}
        commentsEnabled={commentsEnabled}
      />
    );
  const tree = (
    <ChangesFileTree
      entries={entries}
      viewStates={viewStates}
      activePath={navigation.activePath}
      viewedDisabled={viewedDisabled}
      viewedLabel={scope.viewedLabel}
      loading={status === "loading"}
      onSelect={(path) => {
        if (compact) {
          // The tree folds first so the card is measured at its final position.
          setTreeChoice(false);
          queueMicrotask(() => navigation.select(path));
          return;
        }
        navigation.select(path);
      }}
      onToggleViewed={toggleViewed}
    />
  );

  // Compact: the toolbar, a collapsible file list and the cards flow in the page's one scroll.
  if (compact) {
    return (
      <div className="flex flex-col">
        <ChangesToolbarCompact
          mode={mode}
          onMode={setModeChoice}
          wrap={wrap}
          onWrap={setWrap}
          hideWhitespace={hideWhitespace}
          onHideWhitespace={setHideWhitespace}
          allCollapsed={navigation.allCollapsed}
          onCollapseAll={navigation.collapseAll}
          onExpandAll={navigation.expandAll}
          commits={capabilities?.commitDiffs === true && commits.length > 0 ? commits : null}
          commitScope={commit}
          onCommitScope={nav.setCommitScope}
          commentsOffReason={commentsOffReason}
        />
        <button
          type="button"
          aria-expanded={treeOpen}
          className="flex min-h-11 w-full items-center gap-2 px-[var(--m-page-inline)] text-left text-sm font-medium text-foreground"
          onClick={() => setTreeChoice(!treeOpen)}
        >
          {treeOpen ? (
            <ChevronDown className="size-4 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 text-muted" aria-hidden />
          )}
          <Trans>Files</Trans>
          <span className="font-normal tabular-nums text-muted">({entries.length})</span>
        </button>
        {treeOpen ? tree : null}
        {diffArea}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <ChangesToolbar
        treeOpen={treeOpen}
        onToggleTree={() => setTreeChoice(!treeOpen)}
        mode={mode}
        onMode={setModeChoice}
        wrap={wrap}
        onWrap={setWrap}
        hideWhitespace={hideWhitespace}
        onHideWhitespace={setHideWhitespace}
        allCollapsed={navigation.allCollapsed}
        onCollapseAll={navigation.collapseAll}
        onExpandAll={navigation.expandAll}
        commits={capabilities?.commitDiffs === true && commits.length > 0 ? commits : null}
        commitScope={commit}
        onCommitScope={nav.setCommitScope}
        commentsOffReason={commentsOffReason}
        review={submit()}
      />
      <div className="flex min-h-0 flex-1">
        {treeOpen ? (
          <aside className="flex min-h-0 w-[280px] shrink-0 flex-col border-r border-border">
            {tree}
          </aside>
        ) : null}
        <div className="relative min-h-0 min-w-0 flex-1">{diffArea}</div>
      </div>
    </div>
  );
}
