import { Dropdown, Label, Separator } from "@heroui/react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  FileDiff,
  GitMerge,
  GitPullRequest,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { GitBadge } from "./GitBadge";
import { useWorktreeActionVisibility, type SyncAction } from "./useWorktreeActions";
import { readBridge } from "../../bridge";

function getSyncItem(action: SyncAction, ahead: number, behind: number) {
  const items = {
    sync: { id: "sync", label: "Sync", icon: <RefreshCw className="size-3.5 text-muted" /> },
    push: { id: "push", label: ahead > 0 ? `Push (${ahead})` : "Push", icon: <ArrowUpFromLine className="size-3.5 text-muted" /> },
    pull: { id: "pull", label: behind > 0 ? `Pull (${behind})` : "Pull", icon: <ArrowDownToLine className="size-3.5 text-muted" /> },
  };
  return items[action];
}

export function WorktreeGitMenu(props: {
  projectId: string;
  worktreePath: string;
  worktreeBranch: string;
  onOpenGitReview: () => void;
  onGitSync: () => void;
  onGitPush: () => void;
  onGitPull: () => void;
  onGitPullFromSource: () => void;
  onGitMergeToSource: () => void;
  onGitMergeAndRemove: () => void;
  onDeleteWorktree: () => void;
}) {
  const { syncAction, ahead, behind, showMerge, showPullFromSource, sourceAhead, showCreatePr, showOpenPr, prNumber, prUrl } =
    useWorktreeActionVisibility(props.projectId, props.worktreePath);

  const syncItem = getSyncItem(syncAction, ahead, behind);

  return (
    <Dropdown>
      <Dropdown.Trigger>
        <div role="button" tabIndex={0} onClick={(e) => e.stopPropagation()} className="contents">
          <GitBadge
            projectId={props.projectId}
            projectName={props.worktreeBranch}
            worktreePath={props.worktreePath}
          />
        </div>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={`Git actions for ${props.worktreeBranch}`}
          onAction={(key) => {
            if (key === "review") props.onOpenGitReview();
            else if (key === "sync") props.onGitSync();
            else if (key === "push") props.onGitPush();
            else if (key === "pull") props.onGitPull();
            else if (key === "pull-source") props.onGitPullFromSource();
            else if (key === "merge-source") props.onGitMergeToSource();
            else if (key === "merge-remove") props.onGitMergeAndRemove();
            else if (key === "delete-worktree") props.onDeleteWorktree();
            else if (key === "open-pr" && prUrl) void readBridge().openExternal(prUrl);
            else if (key === "create-pr") props.onOpenGitReview();
          }}
        >
          <Dropdown.Item id="review" textValue="Review Changes">
            <FileDiff className="size-3.5 text-muted" />
            <Label>Review Changes</Label>
          </Dropdown.Item>
          <Dropdown.Item id={syncItem.id} textValue={syncItem.label}>
            {syncItem.icon}
            <Label>{syncItem.label}</Label>
          </Dropdown.Item>
          {showPullFromSource ? (
            <Dropdown.Item id="pull-source" textValue="Pull from Source">
              <ArrowDownToLine className="size-3.5 text-muted" />
              <Label>Pull from Source ({sourceAhead})</Label>
            </Dropdown.Item>
          ) : null}
          {showMerge ? (
            <>
              <Separator />
              <Dropdown.Item id="merge-source" textValue="Merge to Source">
                <GitMerge className="size-3.5 text-muted" />
                <Label>Merge to Source</Label>
              </Dropdown.Item>
              <Dropdown.Item id="merge-remove" textValue="Merge & Remove">
                <GitMerge className="size-3.5 text-muted" />
                <Label>Merge & Remove</Label>
              </Dropdown.Item>
            </>
          ) : null}
          {showOpenPr ? (
            <>
              <Separator />
              <Dropdown.Item id="open-pr" textValue={`Open PR #${prNumber}`}>
                <ExternalLink className="size-3.5 text-muted" />
                <Label>Open PR #{prNumber}</Label>
              </Dropdown.Item>
            </>
          ) : showCreatePr ? (
            <>
              <Separator />
              <Dropdown.Item id="create-pr" textValue="Create Pull Request">
                <GitPullRequest className="size-3.5 text-muted" />
                <Label>Create Pull Request</Label>
              </Dropdown.Item>
            </>
          ) : null}
          <Separator />
          <Dropdown.Item id="delete-worktree" textValue="Delete Worktree" variant="danger">
            <Trash2 className="size-3.5 text-danger" />
            <Label>Delete Worktree</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
