import { useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FileMinus2,
  FilePlus2,
  Lock,
  Minus,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Sparkles,
  Undo2,
} from "lucide-react";
import { AlertDialog, Button, ButtonGroup, Dropdown, Label, Spinner, Tooltip } from "@heroui/react";
import type { Project, GitFileChange, GitStatusResult } from "../../../shared/contracts";
import { getProjectAgentStatuses } from "../../../shared/agentStatus";
import { readBridge } from "../../bridge";
import { useAppStore } from "../../state/appStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { SidebarButton, TextArea } from "../common";
import { useSidebar } from "../layout/AppShell";
import { generateCommitMessageWithFallback, getCommitGenCandidates } from "../providers";

function FileStatusIcon(props: { status: string; className?: string }) {
  const cls = `size-3.5 ${props.className ?? ""}`;
  switch (props.status) {
    case "A":
    case "?":
      return <FilePlus2 className={`${cls} text-success`} />;
    case "D":
      return <FileMinus2 className={`${cls} text-danger`} />;
    default:
      return <FileDiff className={`${cls} text-warning`} />;
  }
}

function FileRow(props: {
  file: GitFileChange;
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
}) {
  const { file, project, isSelected, onSelect, onRefresh } = props;
  const [revertOpen, setRevertOpen] = useState(false);

  const basename = file.path.split(/[\\/]/).pop() ?? file.path;
  const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : undefined;

  async function handleStageToggle() {
    if (file.staged) {
      await readBridge().gitUnstage({
        projectLocation: project.location,
        filePath: file.path,
      });
    } else {
      await readBridge().gitStage({
        projectLocation: project.location,
        filePath: file.path,
      });
    }
    onRefresh();
  }

  async function handleRevert() {
    await readBridge().gitRevert({
      projectLocation: project.location,
      filePath: file.path,
    });
    setRevertOpen(false);
    onRefresh();
  }

  return (
    <>
      <button
        type="button"
        className={`group flex w-full cursor-default items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors ${
          isSelected
            ? "bg-white/[0.08] text-foreground"
            : "text-muted hover:bg-white/[0.04] hover:text-foreground"
        }`}
        onClick={onSelect}
      >
        <FileStatusIcon status={file.status} />
        <span className="min-w-0 flex-1 truncate" title={file.path}>
          <span className="text-foreground">{basename}</span>
          {dir && <span className="ml-1 text-muted/60">{dir}</span>}
        </span>

        <span className="relative w-14 shrink-0">
          <span className="flex items-center justify-end text-[10px] font-medium transition-opacity group-hover:opacity-0">
            {file.insertions > 0 && <span className="text-success">+{file.insertions}</span>}
            {file.deletions > 0 && <span className="ml-0.5 text-danger">-{file.deletions}</span>}
          </span>
          <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <div
              role="button"
              tabIndex={0}
              className="rounded p-0.5 text-muted hover:text-foreground"
              title={file.staged ? "Unstage" : "Stage"}
              onClick={(e) => {
                e.stopPropagation();
                void handleStageToggle();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleStageToggle();
                }
              }}
            >
              {file.staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
            </div>
            {!file.staged && (
              <div
                role="button"
                tabIndex={0}
                className="rounded p-0.5 text-muted hover:text-danger"
                title="Revert changes"
                onClick={(e) => {
                  e.stopPropagation();
                  setRevertOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setRevertOpen(true);
                  }
                }}
              >
                <Undo2 className="size-3" />
              </div>
            )}
          </span>
        </span>
      </button>

      <AlertDialog.Backdrop isOpen={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Revert changes</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Are you sure you want to revert <strong>{file.path}</strong>? This cannot be undone.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button variant="danger" onPress={() => void handleRevert()}>
                Revert
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

function FileGroup(props: {
  title: string;
  count: number;
  staged: boolean;
  files: GitFileChange[];
  project: Project;
  selectedFile: string | null;
  onSelectFile: (path: string, staged: boolean) => void;
  onRefresh: () => void;
}) {
  const { title, count, staged, files, project, selectedFile, onSelectFile, onRefresh } = props;
  const [expanded, setExpanded] = useState(true);
  const [revertAllOpen, setRevertAllOpen] = useState(false);

  async function handleStageAll() {
    await readBridge().gitStageAll({ projectLocation: project.location });
    onRefresh();
  }

  async function handleUnstageAll() {
    await readBridge().gitUnstageAll({ projectLocation: project.location });
    onRefresh();
  }

  async function handleRevertAll() {
    await readBridge().gitRevertAll({ projectLocation: project.location });
    setRevertAllOpen(false);
    onRefresh();
  }

  return (
    <div>
      <div className="group/header flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        <button
          type="button"
          className="flex cursor-default items-center gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {title}
          <span className="font-normal text-muted/60">({count})</span>
        </button>
        <span className="ml-auto flex items-center gap-0.5">
          <span className="flex items-center gap-0.5 text-[10px] font-medium font-normal group-hover/header:hidden">
            {files.reduce((s, f) => s + f.insertions, 0) > 0 && (
              <span className="text-success">+{files.reduce((s, f) => s + f.insertions, 0)}</span>
            )}
            {files.reduce((s, f) => s + f.deletions, 0) > 0 && (
              <span className="text-danger">-{files.reduce((s, f) => s + f.deletions, 0)}</span>
            )}
          </span>
          <span className="hidden items-center gap-0.5 group-hover/header:flex">
            {staged ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted hover:text-foreground"
                title="Unstage all"
                onClick={() => void handleUnstageAll()}
              >
                <Minus className="size-3" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted hover:text-foreground"
                  title="Stage all"
                  onClick={() => void handleStageAll()}
                >
                  <Plus className="size-3" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted hover:text-danger"
                  title="Revert all"
                  onClick={() => setRevertAllOpen(true)}
                >
                  <Undo2 className="size-3" />
                </button>
              </>
            )}
          </span>
        </span>
      </div>

      {!staged && (
        <AlertDialog.Backdrop isOpen={revertAllOpen} onOpenChange={setRevertAllOpen}>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Revert all changes</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Are you sure you want to revert all unstaged changes? This cannot be undone.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button variant="danger" onPress={() => void handleRevertAll()}>
                  Revert all
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      )}
      {expanded && (
        <div className="space-y-px">
          {files.map((file) => (
            <FileRow
              key={`${file.staged ? "s" : "u"}:${file.path}`}
              file={file}
              project={project}
              isSelected={selectedFile === file.path}
              onSelect={() => onSelectFile(file.path, file.staged)}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GitReviewSidebar(props: {
  project: Project;
  gitStatus: GitStatusResult | undefined;
  selectedFile: string | null;
  selectedStaged: boolean;
  onSelectFile: (path: string | null, staged: boolean) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { project, gitStatus, selectedFile, selectedStaged, onSelectFile, onClose, onRefresh } =
    props;
  const { isCollapsed, collapse, expand } = useSidebar();
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAppStore((s) => s.wslAgentStatuses);
  const isWsl = project.location.kind === "wsl";
  const commitGenProvider = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenProvider : s.commitGenProvider,
  );
  const commitGenModel = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenModel : s.commitGenModel,
  );
  const commitGenEffort = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenEffort : s.commitGenEffort,
  );

  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  const canGenerateMessage =
    getCommitGenCandidates(projectAgentStatuses, commitGenProvider).length > 0;
  const hasStagedChanges = (gitStatus?.staged.length ?? 0) > 0;
  const hasAnyChanges = hasStagedChanges || (gitStatus?.unstaged.length ?? 0) > 0;
  const canCommitStaged = hasAnyChanges && !isCommitting && !isGenerating;
  const canCommitAll = hasAnyChanges && !isCommitting && !isGenerating;
  const hasRemote = gitStatus?.hasRemote ?? false;
  const hasTracking = Boolean(gitStatus?.tracking);
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  const needsPush = hasTracking ? ahead > 0 && behind === 0 : hasRemote;

  async function generateMessage(): Promise<string> {
    return generateCommitMessageWithFallback({
      projectLocation: project.location,
      agentStatuses: projectAgentStatuses,
      provider: commitGenProvider,
      model: commitGenModel,
      effort: commitGenEffort,
      invoke: (payload) => readBridge().generateCommitMessage(payload),
    });
  }

  async function handleCommit(addAll: boolean) {
    setIsCommitting(true);
    setCommitError(null);
    try {
      let message = commitMessage.trim();
      if (!message && canGenerateMessage) {
        setIsGenerating(true);
        try {
          message = await generateMessage();
          setCommitMessage(message);
        } finally {
          setIsGenerating(false);
        }
      }
      if (!message) throw new Error("Commit message is required");
      await readBridge().gitCommit({
        projectLocation: project.location,
        message,
        addAll,
      });
      setCommitMessage("");
      // Fetch so ahead/behind counts are accurate after commit
      await readBridge()
        .gitFetch({ projectLocation: project.location, remote: "origin", prune: false })
        .catch(() => {});
      onRefresh();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleGenerateMessage() {
    setIsGenerating(true);
    setCommitError(null);
    try {
      const message = await generateMessage();
      setCommitMessage(message);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSyncOrPush() {
    setIsSyncing(true);
    setSyncError(null);
    try {
      if (needsPush) {
        await readBridge().gitPush({
          projectLocation: project.location,
          setUpstream: !hasTracking,
        });
      } else {
        await readBridge().gitSync({ projectLocation: project.location });
      }
      onRefresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="relative h-full">
      {/* Collapsed icon rail */}
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            <SidebarButton
              iconOnly
              icon={<FileDiff className="size-4" />}
              label="Changes"
              isActive
            />
          </div>
          <div className="space-y-1 border-t border-white/6 pt-2 pr-2">
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label="Return to app"
              onPress={onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label="Show sidebar"
              onPress={expand}
            />
          </div>
        </div>
      )}

      {/* Expanded sidebar */}
      <div
        className={`flex h-full min-h-0 flex-col gap-3 px-3 pb-1 pt-0 transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-0.5">
          {gitStatus && gitStatus.staged.length > 0 && (
            <FileGroup
              title="Staged"
              count={gitStatus.staged.length}
              staged
              files={gitStatus.staged}
              project={project}
              selectedFile={selectedStaged ? selectedFile : null}
              onSelectFile={onSelectFile}
              onRefresh={onRefresh}
            />
          )}
          {gitStatus && gitStatus.unstaged.length > 0 && (
            <FileGroup
              title="Changes"
              count={gitStatus.unstaged.length}
              staged={false}
              files={gitStatus.unstaged}
              project={project}
              selectedFile={!selectedStaged ? selectedFile : null}
              onSelectFile={onSelectFile}
              onRefresh={onRefresh}
            />
          )}
          {gitStatus && gitStatus.staged.length === 0 && gitStatus.unstaged.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted/60">No changes</p>
          )}
        </div>

        {/* Commit / Sync Panel */}
        {(hasAnyChanges || hasRemote) && (
          <div className="space-y-2 border-t border-white/6 px-0.5 pt-2">
            {hasAnyChanges ? (
              <>
                <div className="relative">
                  <TextArea
                    fullWidth
                    autoSize
                    maxRows={8}
                    aria-label="Commit message"
                    placeholder="Commit message (Ctrl+Enter)"
                    rows={1}
                    value={commitMessage}
                    className={canGenerateMessage ? "pr-8" : ""}
                    variant="secondary"
                    disabled={isCommitting}
                    onChange={(e) => {
                      setCommitMessage(e.target.value);
                      setCommitError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        if (canCommitStaged) void handleCommit(!hasStagedChanges);
                      }
                    }}
                  />
                  {canGenerateMessage && (
                    <Tooltip delay={0}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className="absolute top-1.5 right-1 size-6 min-w-0"
                        isDisabled={isGenerating || !hasAnyChanges}
                        isPending={isGenerating}
                        onPress={() => void handleGenerateMessage()}
                      >
                        {({ isPending }) =>
                          isPending ? (
                            <Spinner color="current" size="sm" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )
                        }
                      </Button>
                      <Tooltip.Content>Generate commit message</Tooltip.Content>
                    </Tooltip>
                  )}
                </div>

                {commitError && (
                  <p className="truncate text-xs text-danger" title={commitError}>
                    {commitError}
                  </p>
                )}

                <ButtonGroup className="w-full">
                  <Button
                    variant="tertiary"
                    className="flex-1"
                    isDisabled={!canCommitStaged}
                    isPending={isCommitting}
                    onPress={() => void handleCommit(!hasStagedChanges)}
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : (
                          <Lock className="size-3.5" />
                        )}
                        Commit
                      </>
                    )}
                  </Button>
                  <Dropdown>
                    <Button
                      isIconOnly
                      variant="tertiary"
                      aria-label="More commit options"
                      isDisabled={!canCommitAll}
                    >
                      <ButtonGroup.Separator />
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Dropdown.Popover placement="top end">
                      <Dropdown.Menu
                        aria-label="Commit options"
                        onAction={(key) => {
                          if (key === "add-all-commit") void handleCommit(true);
                        }}
                      >
                        <Dropdown.Item id="add-all-commit" textValue="Add all + commit">
                          <Label>Add all + commit</Label>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </ButtonGroup>
              </>
            ) : hasRemote ? (
              <>
                {syncError && (
                  <p className="truncate text-xs text-danger" title={syncError}>
                    {syncError}
                  </p>
                )}
                <Button
                  variant="tertiary"
                  className="w-full"
                  isDisabled={isSyncing}
                  isPending={isSyncing}
                  onPress={() => void handleSyncOrPush()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : needsPush ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5" />
                      )}
                      {needsPush
                        ? `Push${ahead > 0 ? ` ${ahead} commit${ahead === 1 ? "" : "s"}` : ""}`
                        : behind > 0 || ahead > 0
                          ? `Sync${behind > 0 ? ` ↓${behind}` : ""}${ahead > 0 ? ` ↑${ahead}` : ""}`
                          : "Sync"}
                    </>
                  )}
                </Button>
              </>
            ) : null}
          </div>
        )}

        <div className="space-y-1 border-t border-white/6 pt-2">
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label="Return to app"
            onPress={onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label="Hide sidebar"
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
