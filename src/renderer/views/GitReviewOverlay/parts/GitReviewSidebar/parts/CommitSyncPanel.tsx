import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Lock, Sparkles } from "lucide-react";
import { Button, ButtonGroup, Dropdown, Label, Tooltip } from "@heroui/react";
import { PixelLoader, TextArea } from "@/renderer/components/common";
import type { GitSyncCommand } from "@/renderer/actions/gitCommandRunner";
import { GitReviewSection } from "./GitReviewSection";

export function CommitSyncPanel(props: {
  hasAnyChanges: boolean;
  hasStagedChanges: boolean;
  hasRemote: boolean;
  hasTracking: boolean;
  needsPush: boolean;
  ahead: number;
  behind: number;
  commitMessage: string;
  setCommitMessage: (msg: string) => void;
  canCommitStaged: boolean;
  canGenerateMessage: boolean;
  isCommitting: boolean;
  isGenerating: boolean;
  isSyncing: boolean;
  isPullingFromSource: boolean;
  showPullFromSource: boolean;
  sourceBranch: string | null;
  sourceAhead: number;
  handleCommit: (addAll: boolean, pushAfter?: boolean) => Promise<void>;
  handleGenerateMessage: () => Promise<void>;
  handleSyncOrPush: () => Promise<void>;
  handleSyncAction: (key: GitSyncCommand) => Promise<void>;
  handlePullFromSource: () => Promise<void>;
}) {
  const {
    hasAnyChanges,
    hasStagedChanges,
    hasRemote,
    hasTracking,
    needsPush,
    ahead,
    behind,
    commitMessage,
    setCommitMessage,
    canCommitStaged,
    canGenerateMessage,
    isCommitting,
    isGenerating,
    isSyncing,
    isPullingFromSource,
    showPullFromSource,
    sourceBranch,
    sourceAhead,
    handleCommit,
    handleGenerateMessage,
    handleSyncOrPush,
    handleSyncAction,
    handlePullFromSource,
  } = props;

  return (
    <GitReviewSection gap={1}>
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
              className={`lc-commit-message ${canGenerateMessage ? "pr-8" : ""}`}
              variant="secondary"
              disabled={isCommitting}
              onChange={(e) => {
                setCommitMessage(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (canCommitStaged) void handleCommit(!hasStagedChanges, hasRemote);
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
                    isPending ? <PixelLoader size="xs" /> : <Sparkles className="size-3.5" />
                  }
                </Button>
                <Tooltip.Content>Generate commit message</Tooltip.Content>
              </Tooltip>
            )}
          </div>

          {(() => {
            const commitButton = (
              <Button
                variant="tertiary"
                className="flex-1"
                isDisabled={!canCommitStaged}
                isPending={isCommitting}
                onPress={() => void handleCommit(!hasStagedChanges, hasRemote)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <PixelLoader size="xs" />
                    ) : hasRemote ? (
                      <ArrowUp className="size-3.5" />
                    ) : (
                      <Lock className="size-3.5" />
                    )}
                    {hasRemote ? "Commit & Push" : "Commit"}
                  </>
                )}
              </Button>
            );

            const hasMenuItems = hasRemote || showPullFromSource;
            if (!hasMenuItems) {
              return <div className="flex w-full">{commitButton}</div>;
            }

            return (
              <ButtonGroup className="w-full">
                {commitButton}
                <Dropdown>
                  <Button
                    isIconOnly
                    variant="tertiary"
                    aria-label="More commit options"
                    isDisabled={!canCommitStaged}
                  >
                    <ButtonGroup.Separator />
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Dropdown.Popover placement="top end">
                    <Dropdown.Menu
                      aria-label="Commit options"
                      onAction={(key) => {
                        if (key === "commit-only") void handleCommit(!hasStagedChanges);
                        if (key === "pull-from-source") void handlePullFromSource();
                      }}
                    >
                      {hasRemote ? (
                        <Dropdown.Item
                          id="commit-only"
                          textValue="Commit"
                          isDisabled={!canCommitStaged}
                        >
                          <Lock className="size-3.5" />
                          <Label>Commit</Label>
                        </Dropdown.Item>
                      ) : null}
                      {showPullFromSource ? (
                        <Dropdown.Item
                          id="pull-from-source"
                          textValue={`Pull from ${sourceBranch} (${sourceAhead})`}
                          isDisabled={isPullingFromSource}
                        >
                          <ArrowDown className="size-3.5" />
                          <Label>
                            Pull from {sourceBranch} ({sourceAhead})
                          </Label>
                        </Dropdown.Item>
                      ) : null}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </ButtonGroup>
            );
          })()}
          {hasRemote && ahead > 0 ? (
            <Button
              variant="tertiary"
              className="w-full"
              isDisabled={isSyncing}
              isPending={isSyncing}
              onPress={() => void handleSyncAction("push")}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <PixelLoader size="xs" /> : <ArrowUp className="size-3.5" />}
                  Push ({ahead})
                </>
              )}
            </Button>
          ) : null}
        </>
      ) : hasRemote ? (
        (() => {
          const showPull = hasTracking && behind > 0;
          const showPush = ahead > 0 || !hasTracking;
          const showSyncBoth = hasTracking && ahead > 0 && behind > 0;
          const showPullFromSourceItem = Boolean(
            showPullFromSource && sourceBranch && sourceAhead > 0,
          );
          const hasSyncOptions = showPull || showPush || showSyncBoth || showPullFromSourceItem;

          const primaryButton = (
            <Button
              variant="tertiary"
              className="flex-1"
              isDisabled={isSyncing}
              isPending={isSyncing}
              onPress={() => void handleSyncOrPush()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? (
                    <PixelLoader size="xs" />
                  ) : needsPush ? (
                    <ArrowUp className="size-3.5" />
                  ) : (
                    <ArrowUpDown className="size-3.5" />
                  )}
                  {needsPush
                    ? `Push${ahead > 0 ? ` (${ahead})` : ""}`
                    : behind > 0 || ahead > 0
                      ? `Sync${behind > 0 ? ` ↓${behind}` : ""}${ahead > 0 ? ` ↑${ahead}` : ""}`
                      : "Sync"}
                </>
              )}
            </Button>
          );

          if (!hasSyncOptions) {
            return <div className="flex w-full">{primaryButton}</div>;
          }

          return (
            <ButtonGroup className="w-full">
              {primaryButton}
              <Dropdown>
                <Button
                  isIconOnly
                  variant="tertiary"
                  aria-label="More sync options"
                  isDisabled={isSyncing || isPullingFromSource}
                >
                  <ButtonGroup.Separator />
                  <ChevronDown className="size-3.5" />
                </Button>
                <Dropdown.Popover placement="top end">
                  <Dropdown.Menu
                    aria-label="Sync options"
                    onAction={(key) => {
                      if (key === "pull-from-source") {
                        void handlePullFromSource();
                        return;
                      }
                      void handleSyncAction(key as GitSyncCommand);
                    }}
                  >
                    {showPull ? (
                      <Dropdown.Item id="pull" textValue={`Pull (${behind})`}>
                        <ArrowDown className="size-3.5" />
                        <Label>Pull ({behind})</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPull ? (
                      <Dropdown.Item id="pullRebase" textValue={`Pull Rebase (${behind})`}>
                        <ArrowDown className="size-3.5" />
                        <Label>Pull Rebase ({behind})</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPush ? (
                      <Dropdown.Item id="push" textValue={`Push${ahead > 0 ? ` (${ahead})` : ""}`}>
                        <ArrowUp className="size-3.5" />
                        <Label>Push{ahead > 0 ? ` (${ahead})` : ""}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showSyncBoth ? (
                      <Dropdown.Item id="sync" textValue="Sync">
                        <ArrowUpDown className="size-3.5" />
                        <Label>Sync</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showSyncBoth ? (
                      <Dropdown.Item id="syncRebase" textValue="Sync (Rebase)">
                        <ArrowUpDown className="size-3.5" />
                        <Label>Sync (Rebase)</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPullFromSourceItem ? (
                      <Dropdown.Item
                        id="pull-from-source"
                        textValue={`Pull from ${sourceBranch} (${sourceAhead})`}
                        isDisabled={isPullingFromSource}
                      >
                        <ArrowDown className="size-3.5" />
                        <Label>
                          Pull from {sourceBranch} ({sourceAhead})
                        </Label>
                      </Dropdown.Item>
                    ) : null}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </ButtonGroup>
          );
        })()
      ) : null}
    </GitReviewSection>
  );
}
