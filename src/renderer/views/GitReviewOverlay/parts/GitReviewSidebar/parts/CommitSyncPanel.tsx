import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  GitPullRequest,
  Lock,
  Sparkles,
} from "lucide-react";
import { Button, ButtonGroup, Dropdown, Label, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CommitDefaultAction } from "@/shared/contracts";
import { PixelLoader, TextArea } from "@/renderer/components/common";
import type { GitSyncCommand } from "@/renderer/actions/gitCommandRunner";
import { GitReviewSection } from "./GitReviewSection";
import {
  COMMIT_ACTION_LABELS,
  getAvailableCommitActions,
  resolvePrimaryCommitAction,
} from "./commitActions";

// Static icon per commit action — the visual twin of COMMIT_ACTION_LABELS.
const COMMIT_ACTION_ICONS: Record<CommitDefaultAction, ReactNode> = {
  commit: <Lock className="size-3.5" />,
  "commit-push": <ArrowUp className="size-3.5" />,
  "commit-push-pr": <GitPullRequest className="size-3.5" />,
};

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
  canCreatePr: boolean;
  commitDefaultAction: CommitDefaultAction;
  setCommitDefaultAction: (action: CommitDefaultAction) => void;
  isCommitting: boolean;
  isGenerating: boolean;
  isSyncing: boolean;
  prLoading: boolean;
  isPullingFromSource: boolean;
  showPullFromSource: boolean;
  sourceBranch: string | null;
  sourceAhead: number;
  handleCommit: (addAll: boolean, pushAfter?: boolean) => Promise<boolean>;
  handleCommitAndCreatePr: (addAll: boolean) => Promise<void>;
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
    canCreatePr,
    commitDefaultAction,
    setCommitDefaultAction,
    isCommitting,
    isGenerating,
    isSyncing,
    prLoading,
    isPullingFromSource,
    showPullFromSource,
    sourceBranch,
    sourceAhead,
    handleCommit,
    handleCommitAndCreatePr,
    handleGenerateMessage,
    handleSyncOrPush,
    handleSyncAction,
    handlePullFromSource,
  } = props;
  const { t } = useLingui();

  // Resolve which commit action the primary button performs. The user's
  // sticky last-used choice wins when it's actually available; otherwise we
  // degrade to the strongest available action (push needs a remote, PR needs
  // a target branch) without overwriting their stored preference.
  const addAll = !hasStagedChanges;
  const availableCommitActions = getAvailableCommitActions({ hasRemote, canCreatePr });
  const primaryCommitAction = resolvePrimaryCommitAction(commitDefaultAction, {
    hasRemote,
    canCreatePr,
  });
  const runCommitAction = (action: CommitDefaultAction) => {
    if (action === "commit") return void handleCommit(addAll);
    if (action === "commit-push") return void handleCommit(addAll, true);
    return void handleCommitAndCreatePr(addAll);
  };
  // Picking from the dropdown both runs the action and makes it the new
  // sticky default; pressing the primary button only runs it.
  const selectCommitAction = (action: CommitDefaultAction) => {
    setCommitDefaultAction(action);
    runCommitAction(action);
  };
  const primaryCommitPending =
    isCommitting || (primaryCommitAction === "commit-push-pr" && prLoading);

  return (
    <GitReviewSection gap={1}>
      {hasAnyChanges ? (
        <>
          <div className="relative">
            <TextArea
              fullWidth
              autoSize
              maxRows={8}
              aria-label={t`Commit message`}
              placeholder={t`Commit message (Ctrl+Enter)`}
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
                  if (canCommitStaged) runCommitAction(primaryCommitAction);
                }
              }}
            />
            {canGenerateMessage && (
              <Tooltip delay={0}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="lc-commit-generate !absolute top-1.5 right-1 size-6 min-w-0"
                  isDisabled={isGenerating || !hasAnyChanges}
                  isPending={isGenerating}
                  onPress={() => void handleGenerateMessage()}
                >
                  {({ isPending }) =>
                    isPending ? <PixelLoader size="xs" /> : <Sparkles className="size-3.5" />
                  }
                </Button>
                <Tooltip.Content>
                  <Trans>Generate commit message</Trans>
                </Tooltip.Content>
              </Tooltip>
            )}
          </div>

          {(() => {
            const secondaryActions = availableCommitActions.filter(
              (action) => action !== primaryCommitAction,
            );
            const hasMenuItems = secondaryActions.length > 0 || showPullFromSource;

            const commitButton = (
              <Button
                variant="tertiary"
                className={hasMenuItems ? "flex-1" : "w-full"}
                isDisabled={!canCommitStaged}
                isPending={primaryCommitPending}
                onPress={() => runCommitAction(primaryCommitAction)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <PixelLoader size="xs" />
                    ) : (
                      COMMIT_ACTION_ICONS[primaryCommitAction]
                    )}
                    {t(COMMIT_ACTION_LABELS[primaryCommitAction])}
                  </>
                )}
              </Button>
            );

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
                    aria-label={t`More commit options`}
                    isDisabled={!canCommitStaged}
                  >
                    <ButtonGroup.Separator />
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Dropdown.Popover placement="top end">
                    <Dropdown.Menu
                      aria-label={t`Commit options`}
                      onAction={(key) => {
                        if (key === "pull-from-source") {
                          void handlePullFromSource();
                          return;
                        }
                        selectCommitAction(key as CommitDefaultAction);
                      }}
                    >
                      {secondaryActions.map((action) => (
                        <Dropdown.Item
                          key={action}
                          id={action}
                          textValue={t(COMMIT_ACTION_LABELS[action])}
                          isDisabled={!canCommitStaged}
                        >
                          {COMMIT_ACTION_ICONS[action]}
                          <Label>{t(COMMIT_ACTION_LABELS[action])}</Label>
                        </Dropdown.Item>
                      ))}
                      {showPullFromSource ? (
                        <Dropdown.Item
                          id="pull-from-source"
                          textValue={t`Pull from ${sourceBranch} (${sourceAhead})`}
                          isDisabled={isPullingFromSource}
                        >
                          <ArrowDown className="size-3.5" />
                          <Label>
                            <Trans>
                              Pull from {sourceBranch} ({sourceAhead})
                            </Trans>
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
                  <Trans>Push ({ahead})</Trans>
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
                    ? ahead > 0
                      ? t`Push (${ahead})`
                      : t`Push`
                    : behind > 0 || ahead > 0
                      ? `${t`Sync`}${behind > 0 ? ` ↓${behind}` : ""}${ahead > 0 ? ` ↑${ahead}` : ""}`
                      : t`Sync`}
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
                  aria-label={t`More sync options`}
                  isDisabled={isSyncing || isPullingFromSource}
                >
                  <ButtonGroup.Separator />
                  <ChevronDown className="size-3.5" />
                </Button>
                <Dropdown.Popover placement="top end">
                  <Dropdown.Menu
                    aria-label={t`Sync options`}
                    onAction={(key) => {
                      if (key === "pull-from-source") {
                        void handlePullFromSource();
                        return;
                      }
                      void handleSyncAction(key as GitSyncCommand);
                    }}
                  >
                    {showPull ? (
                      <Dropdown.Item id="pull" textValue={t`Pull (${behind})`}>
                        <ArrowDown className="size-3.5" />
                        <Label>{t`Pull (${behind})`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPull ? (
                      <Dropdown.Item id="pullRebase" textValue={t`Pull Rebase (${behind})`}>
                        <ArrowDown className="size-3.5" />
                        <Label>{t`Pull Rebase (${behind})`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPush ? (
                      <Dropdown.Item id="push" textValue={ahead > 0 ? t`Push (${ahead})` : t`Push`}>
                        <ArrowUp className="size-3.5" />
                        <Label>{ahead > 0 ? t`Push (${ahead})` : t`Push`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showSyncBoth ? (
                      <Dropdown.Item id="sync" textValue={t`Sync`}>
                        <ArrowUpDown className="size-3.5" />
                        <Label>{t`Sync`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showSyncBoth ? (
                      <Dropdown.Item id="syncRebase" textValue={t`Sync (Rebase)`}>
                        <ArrowUpDown className="size-3.5" />
                        <Label>{t`Sync (Rebase)`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPullFromSourceItem ? (
                      <Dropdown.Item
                        id="pull-from-source"
                        textValue={t`Pull from ${sourceBranch} (${sourceAhead})`}
                        isDisabled={isPullingFromSource}
                      >
                        <ArrowDown className="size-3.5" />
                        <Label>
                          <Trans>
                            Pull from {sourceBranch} ({sourceAhead})
                          </Trans>
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
