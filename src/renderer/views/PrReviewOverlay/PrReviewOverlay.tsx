import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Columns2, ExternalLink, MessageSquare, RefreshCw, Rows2 } from "lucide-react";
import { Button, Link, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import type { PrDetails, PrFile, Project, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import {
  reviewCacheMatchesSource,
  reviewClient,
  reviewSourceIdentity,
  reviewViewedScope,
} from "@/renderer/utils/forgeReviews";
import { usePrWriteActions } from "@/renderer/hooks/usePrWriteActions";
import { splitUnifiedDiff } from "./parts/parsePrDiff";
import { usePrViewedFiles, viewedFingerprint } from "./parts/prViewedFiles";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { SidebarContext } from "@/renderer/views/MainView/parts/AppShell/AppShell";

const alwaysExpandedSidebar = {
  isCollapsed: false,
  isOverlay: false,
  closingOverlay: false,
  collapse: () => {},
  expand: () => {},
};
import { usePrTitle, usePrUrl, usePrViewerDidAuthor } from "@/renderer/state/gitSelectors";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { PrReviewSidebar } from "./parts/PrReviewSidebar";
import { PrDiffContent } from "./parts/PrDiffContent";
import { SubmitReviewPopover } from "./parts/SubmitReviewPopover";
import { PrHeaderCard } from "./parts/PrHeaderCard";
import { PrMetaRow } from "./parts/PrMetaRow";
import { PrTabs } from "./parts/PrTabs";
import type { PrTabCounts, PrTabKey } from "./parts/PrTabsPill";
import { PrConversationTab } from "./parts/PrConversationTab";
import { PrCommitsTab } from "./parts/PrCommitsTab";
import { PrChecksTab } from "./parts/PrChecksTab";
import type { PrChecksStatus } from "@/renderer/utils/prStatus";

const DIFF_MODE = { Split: 1, Unified: 4 } as const;

/** Main tabbed content area: header/meta row plus the conversation, commits,
 *  checks, and changes panels. Hoisted to module scope (was an inline IIFE
 *  in `PrReviewOverlay`'s `content` prop) so it isn't redefined every render. */
function PrReviewContent(props: {
  contentRef: RefObject<HTMLDivElement | null>;
  metaInHeader: boolean;
  prKey: string;
  cacheKey: string;
  details: PrDetails | undefined;
  files: PrFile[] | undefined;
  rawDiff: string | undefined;
  activeTab: PrTabKey;
  onActiveTabChange: (key: PrTabKey) => void;
  checksStatus: PrChecksStatus | undefined;
  effectiveLocation: ProjectLocation;
  prNumber: number;
  projectId: string;
  loading: boolean;
  onLoad: () => void;
  selectedFile: string | null;
  diffMode: number;
  canEdit: boolean;
  editSaving: boolean;
  onEditPr: (title: string, body: string) => Promise<boolean>;
}) {
  const {
    contentRef,
    metaInHeader,
    prKey,
    cacheKey,
    details,
    files,
    rawDiff,
    activeTab,
    onActiveTabChange,
    checksStatus,
    effectiveLocation,
    prNumber,
    projectId,
    loading,
    onLoad,
    selectedFile,
    diffMode,
    canEdit,
    editSaving,
    onEditPr,
  } = props;

  const counts: PrTabCounts = {
    conversation:
      (details?.comments.length ?? 0) +
      (details?.reviews.filter(
        (r) => r.body || r.state === "APPROVED" || r.state === "CHANGES_REQUESTED",
      ).length ?? 0) +
      (details?.reviewThreads?.length ?? 0),
    commits: details?.commits.length ?? 0,
    checks: details?.checks.length ?? 0,
    changes: files?.length ?? 0,
  };

  return (
    <div ref={contentRef} className="flex h-full min-h-0 flex-col">
      {!metaInHeader && (
        <div className="px-6 pt-2">
          <PrMetaRow prKey={prKey} cacheKey={cacheKey} />
        </div>
      )}
      <PrHeaderCard
        key={`${cacheKey}:${reviewSourceIdentity(details?.source)}:${canEdit}`}
        cacheKey={cacheKey}
        canEdit={canEdit}
        saving={editSaving}
        onSave={onEditPr}
      />
      <div className="min-h-0 flex-1">
        <PrTabs
          active={activeTab}
          onChange={onActiveTabChange}
          counts={counts}
          checksStatus={checksStatus}
          pillInHeaderBreakpoint="never"
          conversationPanel={
            <PrConversationTab
              cacheKey={cacheKey}
              prKey={prKey}
              projectLocation={effectiveLocation}
              prNumber={prNumber}
              loading={loading}
              onPosted={onLoad}
            />
          }
          commitsPanel={<PrCommitsTab cacheKey={cacheKey} prKey={prKey} loading={loading} />}
          checksPanel={<PrChecksTab cacheKey={cacheKey} loading={loading} projectId={projectId} />}
          changesPanel={
            <PrDiffContent
              files={files ?? []}
              rawDiff={rawDiff ?? ""}
              selectedFile={selectedFile}
              diffMode={diffMode}
              loading={loading}
            />
          }
        />
      </div>
    </div>
  );
}

export function PrReviewOverlay(props: {
  project: Project;
  prNumber: number;
  locationOverride?: ProjectLocation;
  worktreePath?: string | undefined;
  skipLocalSync?: boolean;
  /** PR key used for selectors (matches PrSection: worktreePath ?? `__branch:${projectId}`). */
  prKey: string;
  onClose: () => void;
}) {
  const { project, prNumber, locationOverride, worktreePath, skipLocalSync, prKey, onClose } =
    props;
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const [compactPage, setCompactPage] = useState<"files" | "review">("files");
  const effectiveLocation = locationOverride ?? project.location;
  const cacheKey = `${project.id}#${prNumber}`;

  const source = useGitStore((s) => s.prData[prKey]?.source);
  const sourceIdentity = reviewSourceIdentity(source);
  const currentPrNumber = useGitStore((s) => s.prData[prKey]?.number);
  const headSha = useGitStore((s) => s.prData[prKey]?.headSha);
  const files = useGitStore((s) => s.prFiles[cacheKey]);
  const rawDiff = useGitStore((s) => s.prDiffs[cacheKey]);
  const details = useGitStore((s) => s.prDetails[cacheKey]);
  const combinedChecksStatus = usePrCombinedChecksStatus(prKey, cacheKey);
  const prTitleFromData = usePrTitle(prKey);
  const prTitle = prTitleFromData || details?.title || "";
  const prUrl = usePrUrl(prKey);
  const viewerDidAuthor = usePrViewerDidAuthor(prKey);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<number>(DIFF_MODE.Split);
  const [loading, setLoading] = useState(false);
  const [loadedHead, setLoadedHead] = useState<string | null | undefined>(null);
  const loadGeneration = useRef(0);
  const [activeTab, setActiveTab] = useState<PrTabKey>("conversation");

  // Track content width to decide if the meta row fits inline in the content
  // header or should overflow into a row above the tabs. Above ~880px the
  // chips, branches, and stats all fit comfortably; below, they're pushed down.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [metaInHeader, setMetaInHeader] = useState(true);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      setMetaInHeader(w >= 880);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function load() {
    const hasCurrentSource = () => {
      const current = useGitStore.getState().prData[prKey];
      return (
        current !== null &&
        (!current || current.number === prNumber) &&
        reviewSourceIdentity(current?.source) === sourceIdentity &&
        current?.headSha === headSha
      );
    };
    if (!hasCurrentSource()) return;
    const generation = ++loadGeneration.current;
    const isCurrent = () => generation === loadGeneration.current && hasCurrentSource();
    setLoadedHead(null);
    setLoading(true);
    try {
      await Promise.all([
        reviewClient(source)
          .files({ projectLocation: effectiveLocation, prNumber })
          .then((res) => {
            if (isCurrent()) useGitStore.getState().setPrFiles(cacheKey, res.files);
          }),
        reviewClient(source)
          .diff({ projectLocation: effectiveLocation, prNumber })
          .then((res) => {
            if (isCurrent()) useGitStore.getState().setPrDiff(cacheKey, res.diff);
          }),
        reviewClient(source)
          .details({ projectLocation: effectiveLocation, prNumber })
          .then(async (res) => {
            if (!isCurrent()) return;
            useGitStore.getState().setPrDetails(cacheKey, res.details);
            if (res.pr) useGitStore.getState().setPrData(prKey, res.pr);
            const resolvedSource = res.details.source ?? res.pr?.source ?? source;
            if (!resolvedSource || resolvedSource.capabilities.reviewThreads) {
              const { threads } = await reviewClient(resolvedSource).threads({
                projectLocation: effectiveLocation,
                prNumber,
              });
              if (!isCurrent()) return;
              const conversations = threads.filter(
                (thread) => thread.path || thread.comments.length > 1 || thread.isResolved,
              );
              const threadedComments = new Set(
                conversations.flatMap((thread) => thread.comments.map((comment) => comment.id)),
              );
              useGitStore.getState().setPrDetails(cacheKey, {
                ...res.details,
                comments: res.details.comments.filter(
                  (comment) => !threadedComments.has(comment.id),
                ),
                reviewThreads: conversations,
              });
            }
          }),
      ]);
      if (isCurrent()) setLoadedHead(headSha);
    } catch (err) {
      if (isCurrent()) toast.danger(friendlyError(err));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    const state = useGitStore.getState();
    if (
      state.prData[prKey] === null ||
      reviewSourceIdentity(state.prDetails[cacheKey]?.source) !== sourceIdentity
    )
      useGitStore.getState().clearPrCache(cacheKey);
    setSelectedFile(null);
    setActiveTab("conversation");
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset navigation only when the review identity changes
  }, [cacheKey, prKey, sourceIdentity, currentPrNumber]);

  useEffect(() => {
    // Always refetch on open so a stale cache from a previous session never
    // hides new comments / commits / checks.
    void load();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This counter invalidates async loads; it is not a DOM ref.
      loadGeneration.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload/reset when switching PRs or their source identity
  }, [cacheKey, prKey, sourceIdentity, currentPrNumber, headSha]);

  const cacheMatchesSource = reviewCacheMatchesSource(source, details?.source);
  const reviewReady = !loading && loadedHead === headSha && currentPrNumber === prNumber;
  const reviewFiles = cacheMatchesSource ? files : undefined;
  const reviewDiff = cacheMatchesSource ? rawDiff : undefined;
  const viewedScope = reviewViewedScope(source, project.id, prNumber);
  const viewed = usePrViewedFiles(viewedScope);
  const {
    prLoading,
    pendingAction,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
    handleEditPr,
  } = usePrWriteActions({
    projectLocation: effectiveLocation,
    projectId: project.id,
    prKey,
    ...(skipLocalSync ? { skipLocalSync: true } : {}),
    onRefresh: () => {
      void load();
    },
  });
  const patches = splitUnifiedDiff(reviewDiff ?? "");
  const canEdit =
    currentPrNumber === prNumber &&
    details?.number === prNumber &&
    (details.source ?? source)?.capabilities.edit === true &&
    cacheMatchesSource &&
    reviewReady;
  const fileFingerprint = (file: PrFile) => viewedFingerprint(patches.get(file.path), file);
  const viewedAbsorb = useRef(viewed.absorb);
  viewedAbsorb.current = viewed.absorb;
  useEffect(() => {
    if (!cacheMatchesSource || !reviewFiles) return;
    const loaded = splitUnifiedDiff(reviewDiff ?? "");
    viewedAbsorb.current(
      reviewFiles.map((file) => ({
        path: file.path,
        fingerprint: viewedFingerprint(loaded.get(file.path), file),
      })),
    );
  }, [cacheMatchesSource, reviewFiles, reviewDiff]);
  const selectedPrFile = reviewFiles?.find((file) => file.path === selectedFile);
  const selectedFingerprint = selectedPrFile ? fileFingerprint(selectedPrFile) : undefined;
  const selectedViewState =
    selectedPrFile && selectedFingerprint
      ? viewed.state(selectedPrFile.path, selectedFingerprint)
      : "unread";

  const showDiffControls = activeTab === "changes";

  function selectFilePage(path: string) {
    setActiveTab("changes");
    setSelectedFile((curr) => (curr === path ? null : path));
    if (compactLayout) setCompactPage("review");
  }

  function openReviewPage() {
    setCompactPage("review");
  }

  function compactBack() {
    if (compactPage === "review") {
      setCompactPage("files");
      return;
    }
    onClose();
  }

  const sidebar = (
    <PrReviewSidebar
      files={reviewFiles ?? []}
      selectedFile={selectedFile}
      loading={loading || !cacheMatchesSource}
      projectId={project.id}
      prKey={prKey}
      worktreePath={worktreePath}
      {...(skipLocalSync ? { skipLocalSync: true } : {})}
      onSelectFile={selectFilePage}
      onClose={onClose}
      prLoading={prLoading || !reviewReady}
      pendingAction={pendingAction}
      handleMergePr={(method, admin) =>
        reviewReady ? handleMergePr(method, admin) : Promise.resolve()
      }
      handleClosePr={handleClosePr}
      handleMarkPrReady={handleMarkPrReady}
      handleUpdatePrBranch={handleUpdatePrBranch}
      fileFingerprint={fileFingerprint}
      viewedState={viewed.state}
      onMarkViewed={(path, fingerprint) => {
        if (cacheMatchesSource) viewed.mark(path, fingerprint);
      }}
      onClearViewed={(path) => {
        if (cacheMatchesSource) viewed.clear(path);
      }}
      hideFooterNav={compactLayout}
    />
  );

  return (
    <PageLayout
      title={t`PR Review`}
      compactTitle={
        compactPage === "review"
          ? prTitle || (prNumber ? `#${prNumber}` : t`PR Review`)
          : t`PR Review`
      }
      compactBackLabel={compactPage === "files" ? t`Return to app` : t`Back`}
      onCompactBack={compactBack}
      mobileNavigation
      contentHeaderChildren={
        <>
          <div className="flex min-w-0 shrink items-center gap-2 pl-1.5 leading-none">
            <span className="shrink-0 font-mono text-[13px] font-medium tracking-tight text-muted">
              #{prNumber}
            </span>
            {prTitle && (
              <span
                className="min-w-0 max-w-[40ch] truncate text-xs font-medium text-foreground"
                title={prTitle}
              >
                {prTitle}
              </span>
            )}
            {prUrl && (
              <Link
                aria-label={t`Open PR on source host`}
                className="poracode-overlay-header__controls shrink-0 text-muted hover:text-foreground"
                onPress={() => openExternalWithFeedback(prUrl)}
              >
                <ExternalLink className="size-3.5" />
              </Link>
            )}
            {metaInHeader && (
              <>
                <span className="mx-1 h-3 w-px shrink-0 bg-foreground/15" aria-hidden />
                <PrMetaRow prKey={prKey} cacheKey={cacheKey} />
              </>
            )}
          </div>
          {showDiffControls && selectedFile && (
            <div className="poracode-overlay-header__controls flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
                onClick={() => setSelectedFile(null)}
              >
                <ArrowLeft className="size-3" />
                <Trans>All files</Trans>
              </button>
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {selectedFile}
              </span>
              {cacheMatchesSource && selectedPrFile && selectedFingerprint && (
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
                  aria-pressed={selectedViewState === "viewed"}
                  onClick={() => {
                    if (!cacheMatchesSource || !selectedPrFile || !selectedFingerprint) return;
                    if (selectedViewState === "viewed") viewed.clear(selectedPrFile.path);
                    else viewed.mark(selectedPrFile.path, selectedFingerprint);
                  }}
                >
                  {selectedViewState === "viewed" ? t`Viewed here` : t`Mark as viewed`}
                </button>
              )}
            </div>
          )}

          <div className="flex-1" />

          <div className="poracode-overlay-header__controls flex items-center gap-1">
            {showDiffControls && (
              <>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:text-foreground"
                  title={t`Split view`}
                  onClick={() => setDiffMode(DIFF_MODE.Split)}
                >
                  <Columns2
                    className={`size-4 ${diffMode === DIFF_MODE.Split ? "text-foreground" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:text-foreground"
                  title={t`Unified view`}
                  onClick={() => setDiffMode(DIFF_MODE.Unified)}
                >
                  <Rows2
                    className={`size-4 ${diffMode === DIFF_MODE.Unified ? "text-foreground" : ""}`}
                  />
                </button>
              </>
            )}
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-foreground"
              title={t`Refresh`}
              onClick={() => void load()}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <SubmitReviewPopover
              projectLocation={effectiveLocation}
              prNumber={prNumber}
              cacheKey={cacheKey}
              prKey={prKey}
              hidden={viewerDidAuthor === true}
              onSubmitted={() => void load()}
            />
          </div>
        </>
      }
      sidebar={compactLayout ? null : sidebar}
      content={
        compactLayout && compactPage === "files" ? (
          <SidebarContext.Provider value={alwaysExpandedSidebar}>
            <div className="relative flex h-full min-h-0 flex-col">
              <div className="m-page-content shrink-0 px-[var(--m-page-inline)] pt-2">
                <Button fullWidth variant="ghost" className="m-more-row" onPress={openReviewPage}>
                  <span className="m-more-row__icon">
                    <MessageSquare className="size-4" />
                  </span>
                  <span className="m-more-row__body">
                    <strong>
                      <Trans>Conversation</Trans>
                    </strong>
                  </span>
                </Button>
              </div>
              <div className="min-h-0 flex-1">{sidebar}</div>
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-start px-[var(--m-page-inline)]">
                <MobileCircleButton
                  className="pointer-events-auto"
                  aria-label={t`Refresh`}
                  isDisabled={loading}
                  onPress={() => void load()}
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </MobileCircleButton>
              </div>
            </div>
          </SidebarContext.Provider>
        ) : (
          <div className="relative flex h-full min-h-0 flex-col">
            <PrReviewContent
              contentRef={contentRef}
              metaInHeader={metaInHeader}
              prKey={prKey}
              cacheKey={cacheKey}
              details={details}
              files={reviewFiles}
              rawDiff={reviewDiff}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              checksStatus={combinedChecksStatus}
              effectiveLocation={effectiveLocation}
              prNumber={prNumber}
              projectId={project.id}
              loading={loading}
              onLoad={() => void load()}
              selectedFile={selectedFile}
              diffMode={diffMode}
              canEdit={canEdit}
              editSaving={pendingAction === "edit"}
              onEditPr={(title, body) => {
                const current = useGitStore.getState().prData[prKey];
                if (
                  !canEdit ||
                  current?.number !== prNumber ||
                  reviewSourceIdentity(current.source) !== sourceIdentity
                )
                  return Promise.resolve(false);
                return handleEditPr({ title, body });
              }}
            />
            {compactLayout ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-end justify-between gap-[var(--m-floating-control-gap)] px-[var(--m-page-inline)]">
                <MobileCircleButton
                  className="pointer-events-auto"
                  aria-label={t`Refresh`}
                  isDisabled={loading}
                  onPress={() => void load()}
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </MobileCircleButton>
                <div className="pointer-events-auto min-w-0">
                  <SubmitReviewPopover
                    projectLocation={effectiveLocation}
                    prNumber={prNumber}
                    cacheKey={cacheKey}
                    prKey={prKey}
                    hidden={viewerDidAuthor === true}
                    triggerPresentation="touch"
                    onSubmitted={() => void load()}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      }
    />
  );
}
