import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Columns2, GitBranch, RefreshCw, Rows2 } from "lucide-react";
import { Button, Dropdown, Label } from "@heroui/react";
import type { Selection } from "@heroui/react";
import type { Project, ProjectLocation, GitStatusResult } from "../../../shared/contracts";
import { readBridge } from "../../bridge";
import { useGitStore } from "../../state/gitStore";
import { AppShell } from "../layout/AppShell";
import { OverlayHeader } from "../layout/OverlayHeader";
import { GitReviewSidebar } from "./GitReviewSidebar";
import { GitDiffContent, type DiffFilter } from "./GitDiffContent";

/** Matches DiffModeEnum values from @git-diff-view/react — kept local to avoid importing the heavy library. */
const DIFF_MODE = { Split: 1, Unified: 4 } as const;

export function GitReviewOverlay(props: {
  project: Project;
  locationOverride?: ProjectLocation;
  statusKey?: string;
  onClose: () => void;
}) {
  const { project, locationOverride, statusKey, onClose } = props;
  const effectiveLocation = locationOverride ?? project.location;
  // Create a project view with the effective location so child components
  // (GitReviewSidebar, GitDiffContent) use the right path for IPC calls.
  const effectiveProject = locationOverride ? { ...project, location: effectiveLocation } : project;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [diffMode, setDiffMode] = useState<number>(DIFF_MODE.Split);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("changes");
  const gitStatus = useGitStore((s) =>
    statusKey ? s.worktreeStatuses[statusKey] : s.statuses[project.id],
  ) as GitStatusResult | undefined;

  // Auto-switch when the current view becomes empty but the other has files
  useEffect(() => {
    if (!gitStatus) return;
    if (
      diffFilter === "changes" &&
      gitStatus.unstaged.length === 0 &&
      gitStatus.staged.length > 0
    ) {
      setDiffFilter("staged");
    }
    if (diffFilter === "staged" && gitStatus.staged.length === 0 && gitStatus.unstaged.length > 0) {
      setDiffFilter("changes");
    }
  }, [gitStatus, diffFilter]);

  function handleSelectFile(path: string | null, staged: boolean) {
    setSelectedFile(path);
    setSelectedStaged(staged);
  }

  async function handleRefresh() {
    try {
      const status = await readBridge().getGitStatus({
        projectLocation: effectiveLocation,
      });
      if (statusKey) {
        useGitStore.getState().setWorktreeStatus(statusKey, status);
      } else {
        useGitStore.getState().setStatus(project.id, status);
      }
    } catch {
      // ignore
    }
    setRefreshKey((k) => k + 1);
  }

  return (
    <>
      <OverlayHeader title="Git Review">
        {gitStatus?.branch && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <GitBranch className="size-3" />
            <span className="truncate">{gitStatus.branch}</span>
          </div>
        )}

        {selectedFile && (
          <div className="lightcode-overlay-header__controls flex items-center gap-3">
            <div className="h-3 w-px bg-border" />
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
              onClick={() => handleSelectFile(null, false)}
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

        {!selectedFile && (
          <div className="lightcode-overlay-header__controls">
            <Dropdown>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs text-muted">
                {diffFilter === "changes"
                  ? `Changes${gitStatus ? ` (${gitStatus.unstaged.length})` : ""}`
                  : `Staged${gitStatus ? ` (${gitStatus.staged.length})` : ""}`}
                <ChevronDown className="size-3" />
              </Button>
              <Dropdown.Popover placement="bottom" className="min-w-0">
                <Dropdown.Menu
                  className="text-xs"
                  selectedKeys={new Set([diffFilter])}
                  selectionMode="single"
                  onSelectionChange={(keys: Selection) => {
                    const key = [...keys][0] as DiffFilter | undefined;
                    if (key) setDiffFilter(key);
                  }}
                >
                  {gitStatus && gitStatus.staged.length > 0 ? (
                    <Dropdown.Item id="staged" textValue="Staged">
                      <Dropdown.ItemIndicator />
                      <Label>Staged ({gitStatus.staged.length})</Label>
                    </Dropdown.Item>
                  ) : null}
                  {gitStatus && gitStatus.unstaged.length > 0 ? (
                    <Dropdown.Item id="changes" textValue="Changes">
                      <Dropdown.ItemIndicator />
                      <Label>Changes ({gitStatus.unstaged.length})</Label>
                    </Dropdown.Item>
                  ) : null}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        )}

        <div className="lightcode-overlay-header__controls flex items-center gap-1">
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
          <button
            type="button"
            className="rounded p-1 text-muted hover:text-foreground"
            title="Refresh"
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </OverlayHeader>

      <div className="lightcode-overlay-body min-h-0 flex-1">
        <AppShell
          sidebar={
            <GitReviewSidebar
              project={effectiveProject}
              gitStatus={gitStatus}
              selectedFile={selectedFile}
              selectedStaged={selectedStaged}
              onSelectFile={handleSelectFile}
              onClose={onClose}
              onRefresh={() => void handleRefresh()}
            />
          }
          content={
            <GitDiffContent
              project={effectiveProject}
              gitStatus={gitStatus}
              selectedFile={selectedFile}
              selectedStaged={selectedStaged}
              diffMode={diffMode}
              diffFilter={diffFilter}
              refreshKey={refreshKey}
            />
          }
        />
      </div>
    </>
  );
}
