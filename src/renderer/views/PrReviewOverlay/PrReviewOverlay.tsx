import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Columns2, ExternalLink, RefreshCw, Rows2 } from "lucide-react";
import { Link, toast } from "@heroui/react";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { usePrTitle, usePrUrl, usePrViewerDidAuthor } from "@/renderer/state/gitSelectors";
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

const DIFF_MODE = { Split: 1, Unified: 4 } as const;

export function PrReviewOverlay(props: {
  project: Project;
  prNumber: number;
  locationOverride?: ProjectLocation;
  worktreePath?: string | undefined;
  /** PR key used for selectors (matches PrSection: worktreePath ?? `__branch:${projectId}`). */
  prKey: string;
  onClose: () => void;
}) {
  const { project, prNumber, locationOverride, worktreePath, prKey, onClose } = props;
  const effectiveLocation = locationOverride ?? project.location;
  const cacheKey = `${project.id}#${prNumber}`;

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
    setLoading(true);
    try {
      await Promise.all([
        readBridge()
          .ghGetPrFiles({ projectLocation: effectiveLocation, prNumber })
          .then((res) => useGitStore.getState().setPrFiles(cacheKey, res.files)),
        readBridge()
          .ghGetPrDiff({ projectLocation: effectiveLocation, prNumber })
          .then((res) => useGitStore.getState().setPrDiff(cacheKey, res.diff)),
        readBridge()
          .ghGetPrDetails({ projectLocation: effectiveLocation, prNumber })
          .then((res) => useGitStore.getState().setPrDetails(cacheKey, res.details)),
      ]);
    } catch (err) {
      toast.danger(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedFile(null);
    setActiveTab("conversation");
    // Always refetch on open so a stale cache from a previous session never
    // hides new comments / commits / checks.
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload/reset only when switching PR cache keys
  }, [cacheKey]);

  const showDiffControls = activeTab === "changes";

  return (
    <PageLayout
      title="PR Review"
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
                aria-label="Open PR on GitHub"
                className="lightcode-overlay-header__controls shrink-0 text-muted hover:text-foreground"
                onPress={() => void readBridge().openExternal(prUrl)}
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
            <div className="lightcode-overlay-header__controls flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
                onClick={() => setSelectedFile(null)}
              >
                <ArrowLeft className="size-3" />
                All files
              </button>
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {selectedFile}
              </span>
            </div>
          )}

          <div className="flex-1" />

          <div className="lightcode-overlay-header__controls flex items-center gap-1">
            {showDiffControls && (
              <>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:text-foreground"
                  title="Split view"
                  onClick={() => setDiffMode(DIFF_MODE.Split)}
                >
                  <Columns2
                    className={`size-4 ${diffMode === DIFF_MODE.Split ? "text-foreground" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:text-foreground"
                  title="Unified view"
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
              title="Refresh"
              onClick={() => void load()}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <SubmitReviewPopover
              projectLocation={effectiveLocation}
              prNumber={prNumber}
              hidden={viewerDidAuthor === true}
              onSubmitted={() => void load()}
            />
          </div>
        </>
      }
      sidebar={
        <PrReviewSidebar
          files={files ?? []}
          selectedFile={selectedFile}
          loading={loading}
          projectId={project.id}
          projectLocation={effectiveLocation}
          prKey={prKey}
          worktreePath={worktreePath}
          onSelectFile={(path) => {
            setActiveTab("changes");
            setSelectedFile((curr) => (curr === path ? null : path));
          }}
          onClose={onClose}
          onRefresh={() => void load()}
        />
      }
      content={(() => {
        const counts: PrTabCounts = {
          conversation:
            (details?.comments.length ?? 0) +
            (details?.reviews.filter(
              (r) => r.body || r.state === "APPROVED" || r.state === "CHANGES_REQUESTED",
            ).length ?? 0),
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
            <PrHeaderCard cacheKey={cacheKey} />
            <div className="min-h-0 flex-1">
              <PrTabs
                active={activeTab}
                onChange={setActiveTab}
                counts={counts}
                checksStatus={combinedChecksStatus}
                pillInHeaderBreakpoint="never"
                conversationPanel={
                  <PrConversationTab
                    cacheKey={cacheKey}
                    projectLocation={effectiveLocation}
                    prNumber={prNumber}
                    loading={loading}
                    onPosted={() => void load()}
                  />
                }
                commitsPanel={<PrCommitsTab cacheKey={cacheKey} prKey={prKey} loading={loading} />}
                checksPanel={<PrChecksTab cacheKey={cacheKey} loading={loading} />}
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
      })()}
    />
  );
}
