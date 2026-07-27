import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileDiff,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrFile, ProjectLocation } from "@/shared/contracts";
import { SidebarButton } from "@/renderer/components/common";
import {
  gitReviewColumnClass,
  gitReviewSidebarListScrollClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { compareFilesByDirThenName } from "@/renderer/utils/gitHelpers";
import { usePrWriteActions } from "@/renderer/hooks/usePrWriteActions";
import { GitReviewPadXProvider } from "../../GitReviewOverlay/parts/GitReviewSidebar/gitReviewPadXContext";
import { PrSection } from "../../GitReviewOverlay/parts/GitReviewSidebar/parts/PrSection";
import { PrFileRow } from "./PrFileRow";

export function PrReviewSidebar(props: {
  files: PrFile[];
  selectedFile: string | null;
  loading: boolean;
  projectId: string;
  projectLocation: ProjectLocation;
  mergeSyncLocation: ProjectLocation;
  prKey: string;
  worktreePath?: string | undefined;
  skipLocalSync?: boolean;
  onSelectFile: (path: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const {
    files,
    selectedFile,
    loading,
    projectId,
    projectLocation,
    mergeSyncLocation,
    prKey,
    worktreePath,
    skipLocalSync,
    onSelectFile,
    onClose,
    onRefresh,
  } = props;
  const { t } = useLingui();
  const { isCollapsed, collapse, expand } = useSidebar();
  const [expanded, setExpanded] = useState(true);
  const {
    prLoading,
    pendingAction,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
  } = usePrWriteActions({
    projectLocation,
    mergeSyncLocation,
    prKey,
    ...(skipLocalSync ? { skipLocalSync: true } : {}),
    onRefresh,
  });

  const sorted = files.toSorted((a, b) =>
    compareFilesByDirThenName({ path: a.path }, { path: b.path }),
  );

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="relative h-full">
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            <SidebarButton
              iconOnly
              icon={<FileDiff className="size-4" />}
              label={t`Changes in PR`}
              isActive
            />
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label={t`Show sidebar`}
              onPress={expand}
            />
          </div>
        </div>
      )}

      <GitReviewPadXProvider rowPadX="px-2" sectionPadX="px-0">
        <div
          className={`${gitReviewColumnClass("overlay")} transition-opacity duration-150 ${
            isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"
          }`}
        >
          <div className={gitReviewSidebarListScrollClass()}>
            <div className="pt-1">
              <div className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                <button
                  type="button"
                  className="flex cursor-default items-center gap-1"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  <Trans>Changes in PR</Trans>
                  <span className="font-normal text-muted/60">({files.length})</span>
                </button>
                <span className="ml-auto flex items-center gap-0.5 text-[10px] leading-4 font-medium font-normal">
                  {totalAdditions > 0 && <span className="text-success">+{totalAdditions}</span>}
                  {totalDeletions > 0 && <span className="text-danger">-{totalDeletions}</span>}
                </span>
              </div>
              {expanded && (
                <div className="space-y-px">
                  {loading && files.length === 0 && (
                    <div className="flex items-center justify-center px-2 py-3 text-xs text-muted/60">
                      <Trans>Loading PR…</Trans>
                    </div>
                  )}
                  {!loading && files.length === 0 && (
                    <div className="flex items-center justify-center px-2 py-3 text-xs text-muted/60">
                      <Trans>No changes</Trans>
                    </div>
                  )}
                  {sorted.map((file) => (
                    <PrFileRow
                      key={file.path}
                      file={file}
                      isSelected={selectedFile === file.path}
                      onSelect={() => onSelectFile(file.path)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <PrSection
            prKey={prKey}
            projectId={projectId}
            worktreePath={worktreePath}
            {...(skipLocalSync ? { skipLocalSync: true } : {})}
            prLoading={prLoading}
            pendingAction={pendingAction}
            handleMergePr={handleMergePr}
            handleClosePr={handleClosePr}
            handleMarkPrReady={handleMarkPrReady}
            handleUpdatePrBranch={handleUpdatePrBranch}
          />

          <div className={sidebarFooterNavClass}>
            <SidebarButton
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={onClose}
            />
            <SidebarButton
              icon={<PanelLeftClose className="size-4" />}
              label={t`Hide sidebar`}
              onPress={collapse}
            />
          </div>
        </div>
      </GitReviewPadXProvider>
    </div>
  );
}
