import type { ReactNode } from "react";
import {
  Archive,
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
import type { GitActionPhase } from "@/renderer/state/gitReviewActionStore";
import { PixelLoader, TextArea } from "@/renderer/components/common";
import type { GitSyncCommand } from "@/renderer/actions/gitCommandRunner";
import { GitReviewSection } from "./GitReviewSection";
import { ActionPhaseLabel } from "./ActionPhaseLabel";
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
  hasPendingPullStash: boolean;
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
  actionPhase: GitActionPhase | null;
  isPullingFromSource: boolean;
  showPullFromSource: boolean;
  sourceBranch: string | null;
  sourceAhead: number;
  handleCommit: (addAll: boolean, pushAfter?: boolean) => Promise<boolean>;
  handleCommitAndCreatePr: (addAll: boolean) => Promise<void>;
  handleGenerateMessage: () => Promise<void>;
  handleSyncOrPush: () => Promise<void>;
  handleSyncAction: (key: GitSyncCommand) => Promise<void>;
  handlePushAndCreatePr: () => Promise<void>;
  handlePullFromSource: () => Promise<void>;
}) {
  const {
    hasAnyChanges,
    hasPendingPullStash,
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
    actionPhase,
    isPullingFromSource,
    showPullFromSource,
    sourceBranch,
    sourceAhead,
    handleCommit,
    handleCommitAndCreatePr,
    handleGenerateMessage,
    handleSyncOrPush,
    handleSyncAction,
    handlePushAndCreatePr,
    handlePullFromSource,
  } = props;
  const { t } = useLingui();

  // Resolve which commit action the primary button performs. The user's
  // sticky last-used choice wins when it's actually available; otherwise we
  // degrade to the strongest available action (push needs a remote, PR needs
  // a target branch) without overwriting their stored preference.
  const addAll = !hasStagedChanges;
  const actionInFlight = actionPhase !== null;
  // `canCommitStaged` covers the repo-state preconditions; the phase slot adds
  // "nothing else is running", so every commit entry point shares one flag.
  const canRunCommitAction = canCommitStaged && !actionInFlight;
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
  // Each row's primary button owns the live step for every action its split
  // menu can start — including the pull-from-source item — so the phase label
  // shows up in the control the user actually pressed. Only the button whose
  // own action is running claims the phase; an unrelated step (the AI generate
  // button, or the other row) leaves it captioned normally.
  const commitPending = isCommitting || (primaryCommitAction === "commit-push-pr" && prLoading);
  const commitPhase = commitPending || isPullingFromSource ? actionPhase : null;
  const pushPhase = isSyncing ? actionPhase : null;
  const syncPhase = isSyncing || isPullingFromSource ? actionPhase : null;

  return (
    <GitReviewSection gap={1}>
      {hasAnyChanges ? (
        <>
          <div className="relative flex">
            <TextArea
              fullWidth
              autoSize
              maxRows={8}
              aria-label={t`Commit message`}
              placeholder={t`Commit message (Ctrl+Enter)`}
              rows={1}
              value={commitMessage}
              className={`lc-commit-message ${
                canGenerateMessage && hasPendingPullStash
                  ? "pr-14"
                  : canGenerateMessage || hasPendingPullStash
                    ? "pr-8"
                    : ""
              }`}
              variant="secondary"
              disabled={isCommitting}
              onChange={(e) => {
                setCommitMessage(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (canRunCommitAction) runCommitAction(primaryCommitAction);
                }
              }}
            />
            {canGenerateMessage && (
              <Tooltip delay={0}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="lc-commit-field-action lc-commit-generate !absolute top-1.5 right-1 size-6 min-w-0"
                  isDisabled={isGenerating || actionInFlight || !hasAnyChanges}
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
            {hasPendingPullStash && (
              <Tooltip delay={0}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Stashed changes pending`}
                  className={`lc-commit-field-action !absolute top-1.5 size-6 min-w-0 text-muted ${
                    canGenerateMessage ? "right-8" : "right-1"
                  }`}
                >
                  <Archive className="size-3.5" />
                </Button>
                <Tooltip.Content>
                  <Trans>
                    Your local changes are stashed and will be re-applied when you commit or abort
                    this merge.
                  </Trans>
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
                isDisabled={!canRunCommitAction}
                isPending={commitPending || Boolean(commitPhase)}
                onPress={() => runCommitAction(primaryCommitAction)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <PixelLoader size="xs" />
                    ) : (
                      COMMIT_ACTION_ICONS[primaryCommitAction]
                    )}
                    {commitPhase ? (
                      <ActionPhaseLabel phase={commitPhase} />
                    ) : (
                      t(COMMIT_ACTION_LABELS[primaryCommitAction])
                    )}
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
                    isDisabled={!canRunCommitAction}
                  >
                    <ButtonGroup.Separator />
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Dropdown.Popover placement="top end">
                    <Dropdown.Menu
                      aria-label={t`Commit options`}
                      onAction={(key) => {
                        if (actionInFlight) return;
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
                          isDisabled={!canRunCommitAction}
                        >
                          {COMMIT_ACTION_ICONS[action]}
                          <Label>{t(COMMIT_ACTION_LABELS[action])}</Label>
                        </Dropdown.Item>
                      ))}
                      {showPullFromSource ? (
                        <Dropdown.Item
                          id="pull-from-source"
                          textValue={t`Pull from ${sourceBranch} (${sourceAhead})`}
                          isDisabled={isPullingFromSource || actionInFlight}
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
              isDisabled={isSyncing || actionInFlight}
              isPending={isSyncing}
              onPress={() => void handleSyncAction("push")}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <PixelLoader size="xs" /> : <ArrowUp className="size-3.5" />}
                  {pushPhase ? (
                    <ActionPhaseLabel phase={pushPhase} />
                  ) : (
                    <Trans>Push ({ahead})</Trans>
                  )}
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
          // Committed but not pushed yet: offer the chained push + PR here too,
          // so the flow the commit split-button offers before committing (and
          // the PR section offers after pushing) stays reachable in between.
          const showPushPr = showPush && canCreatePr;
          const showPullFromSourceItem = Boolean(
            showPullFromSource && sourceBranch && sourceAhead > 0,
          );
          const hasSyncOptions =
            showPull || showPush || showPushPr || showSyncBoth || showPullFromSourceItem;

          const primaryButton = (
            <Button
              variant="tertiary"
              className="flex-1"
              isDisabled={isSyncing || actionInFlight}
              isPending={isSyncing || Boolean(syncPhase)}
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
                  {syncPhase ? (
                    <ActionPhaseLabel phase={syncPhase} />
                  ) : needsPush ? (
                    ahead > 0 ? (
                      t`Push (${ahead})`
                    ) : (
                      t`Push`
                    )
                  ) : behind > 0 || ahead > 0 ? (
                    `${t`Sync`}${behind > 0 ? ` ↓${behind}` : ""}${ahead > 0 ? ` ↑${ahead}` : ""}`
                  ) : (
                    t`Sync`
                  )}
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
                  isDisabled={isSyncing || isPullingFromSource || actionInFlight}
                >
                  <ButtonGroup.Separator />
                  <ChevronDown className="size-3.5" />
                </Button>
                <Dropdown.Popover placement="top end">
                  <Dropdown.Menu
                    aria-label={t`Sync options`}
                    onAction={(key) => {
                      if (actionInFlight) return;
                      if (key === "pull-from-source") {
                        void handlePullFromSource();
                        return;
                      }
                      if (key === "push-pr") {
                        void handlePushAndCreatePr();
                        return;
                      }
                      void handleSyncAction(key as GitSyncCommand);
                    }}
                  >
                    {showPull ? (
                      <Dropdown.Item
                        id="pull"
                        textValue={t`Pull (${behind})`}
                        isDisabled={actionInFlight}
                      >
                        <ArrowDown className="size-3.5" />
                        <Label>{t`Pull (${behind})`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPull ? (
                      <Dropdown.Item
                        id="pullRebase"
                        textValue={t`Pull Rebase (${behind})`}
                        isDisabled={actionInFlight}
                      >
                        <ArrowDown className="size-3.5" />
                        <Label>{t`Pull Rebase (${behind})`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPush ? (
                      <Dropdown.Item
                        id="push"
                        textValue={ahead > 0 ? t`Push (${ahead})` : t`Push`}
                        isDisabled={actionInFlight}
                      >
                        <ArrowUp className="size-3.5" />
                        <Label>{ahead > 0 ? t`Push (${ahead})` : t`Push`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPushPr ? (
                      <Dropdown.Item
                        id="push-pr"
                        textValue={t`Push & Create PR`}
                        isDisabled={actionInFlight}
                      >
                        <GitPullRequest className="size-3.5" />
                        <Label>{t`Push & Create PR`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showSyncBoth ? (
                      <Dropdown.Item id="sync" textValue={t`Sync`} isDisabled={actionInFlight}>
                        <ArrowUpDown className="size-3.5" />
                        <Label>{t`Sync`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showSyncBoth ? (
                      <Dropdown.Item
                        id="syncRebase"
                        textValue={t`Sync (Rebase)`}
                        isDisabled={actionInFlight}
                      >
                        <ArrowUpDown className="size-3.5" />
                        <Label>{t`Sync (Rebase)`}</Label>
                      </Dropdown.Item>
                    ) : null}
                    {showPullFromSourceItem ? (
                      <Dropdown.Item
                        id="pull-from-source"
                        textValue={t`Pull from ${sourceBranch} (${sourceAhead})`}
                        isDisabled={isPullingFromSource || actionInFlight}
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
