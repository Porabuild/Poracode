import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  ExternalLink,
  GitMerge,
  RefreshCw,
  ShieldOff,
} from "lucide-react";
import {
  Button,
  ButtonGroup,
  Dropdown,
  Label,
  Link,
  Separator,
  ToggleButton,
  Tooltip,
} from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import type { PrWriteAction } from "@/renderer/hooks/usePrWriteActions";
import {
  usePrMergeStateStatus,
  usePrMergeable,
  usePrNumber,
  usePrState,
  usePrTitle,
  usePrUrl,
} from "@/renderer/state/gitSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import { usePrCombinedChecksStatus } from "@/renderer/hooks/usePrCombinedChecksStatus";
import { getPrStatusTone, PR_TONE_BG_CLASS } from "@/renderer/utils/prStatus";
import { GitReviewSection } from "./GitReviewSection";

const BLOCK_REASON: Record<string, MessageDescriptor> = {
  BLOCKED: msg`Required reviews, conversations, or status checks not met.`,
  BEHIND: msg`Base branch is ahead — branch must be updated first.`,
  DIRTY: msg`Merge conflicts must be resolved.`,
  UNSTABLE: msg`Some checks are failing or pending.`,
  HAS_HOOKS: msg`Repository pre-receive hook is blocking the merge.`,
};

export function PrSection(props: {
  prKey: string;
  projectId: string;
  worktreePath?: string | undefined;
  prLoading: boolean;
  /** Which write action is in flight, so only its button spins (others stay disabled). */
  pendingAction?: PrWriteAction | null | undefined;
  handleMergePr: (method: "merge" | "squash" | "rebase", admin?: boolean) => Promise<void>;
  handleClosePr: () => Promise<void>;
  handleMarkPrReady: () => Promise<void>;
  handleUpdatePrBranch?: ((rebase?: boolean) => Promise<void>) | undefined;
  /** Refetch this PR's live data on demand. When omitted, no refresh icon shows. */
  onRefreshPr?: (() => void | Promise<void>) | undefined;
  isRefreshingPr?: boolean | undefined;
}) {
  const {
    prKey,
    projectId,
    worktreePath,
    prLoading,
    pendingAction,
    handleMergePr,
    handleClosePr,
    handleMarkPrReady,
    handleUpdatePrBranch,
    onRefreshPr,
    isRefreshingPr,
  } = props;
  const { t } = useLingui();
  const state = usePrState(prKey);
  const number = usePrNumber(prKey);
  const title = usePrTitle(prKey);
  const url = usePrUrl(prKey);
  const cacheKey = number !== undefined ? `${projectId}#${number}` : undefined;
  const combinedChecksStatus = usePrCombinedChecksStatus(prKey, cacheKey);
  const mergeStateStatus = usePrMergeStateStatus(prKey);
  const mergeable = usePrMergeable(prKey);
  const [bypass, setBypass] = useState(false);

  const indicatorColor = PR_TONE_BG_CLASS[getPrStatusTone(state, combinedChecksStatus)];

  const reasonKey = mergeable === "CONFLICTING" ? "DIRTY" : mergeStateStatus;
  const isBlocked =
    reasonKey !== undefined &&
    reasonKey !== "CLEAN" &&
    reasonKey !== "DRAFT" &&
    reasonKey !== "UNKNOWN";
  const blockReasonMsg = reasonKey ? BLOCK_REASON[reasonKey] : undefined;
  const blockReason = blockReasonMsg ? t(blockReasonMsg) : undefined;
  // Conflicts and pre-receive hooks can't be admin-bypassed.
  const canBypass = isBlocked && reasonKey !== "DIRTY" && reasonKey !== "HAS_HOOKS";

  const stateBadge = state === "draft" ? t`(Draft)` : "";
  const fallbackTitle =
    title || (state === "merged" ? t`Merged` : state === "draft" ? "" : t`Open`);

  const canReview = number !== undefined && state !== "merged" && state !== "closed";
  // Offer refresh for live PRs only — a merged/closed PR's head branch is often
  // gone, so a by-branch refetch is pointless. Mirrors `canReview`'s exclusions.
  const canRefresh = Boolean(onRefreshPr) && state !== "merged" && state !== "closed";

  return (
    <GitReviewSection>
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${indicatorColor}`} />
        <Link
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs leading-tight text-muted no-underline hover:text-foreground hover:underline focus-visible:text-primary focus-visible:underline"
          isDisabled={!url}
          onPress={() => url && void readBridge().openExternal(url)}
        >
          <span className="min-w-0 truncate leading-tight" title={title || undefined}>
            #{number}
            {stateBadge}
            {fallbackTitle ? ` - ${fallbackTitle}` : ""}
          </span>
          <ExternalLink className="size-4 shrink-0" />
        </Link>
        {canRefresh && (
          <Tooltip delay={300}>
            <Tooltip.Trigger>
              <button
                type="button"
                aria-label="Refresh PR"
                className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground disabled:opacity-50"
                disabled={isRefreshingPr}
                onClick={() => void onRefreshPr?.()}
              >
                <RefreshCw className={`size-3.5 ${isRefreshingPr ? "animate-spin" : ""}`} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">Refresh PR</Tooltip.Content>
          </Tooltip>
        )}
        {canReview && (
          <Tooltip delay={300}>
            <Tooltip.Trigger>
              <button
                type="button"
                aria-label={t`Review PR`}
                className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                onClick={() =>
                  usePanelStore.getState().setPrReviewContext({
                    projectId,
                    ...(worktreePath !== undefined ? { worktreePath } : {}),
                    prNumber: number,
                  })
                }
              >
                <Eye className="size-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">
              <Trans>Review PR</Trans>
            </Tooltip.Content>
          </Tooltip>
        )}
      </div>
      {state === "draft" && (
        <ButtonGroup className="w-full">
          <Button
            variant="tertiary"
            className="flex-1"
            isDisabled={prLoading}
            isPending={pendingAction === "ready"}
            onPress={() => void handleMarkPrReady()}
          >
            {({ isPending }) => (
              <>
                {isPending ? <PixelLoader size="xs" /> : <CheckCircle2 className="size-3.5" />}
                <Trans>Ready for Review</Trans>
              </>
            )}
          </Button>
          <Dropdown>
            <Button
              isIconOnly
              variant="tertiary"
              aria-label={t`More PR actions`}
              isDisabled={prLoading}
            >
              <ButtonGroup.Separator />
              <ChevronDown className="size-3.5" />
            </Button>
            <Dropdown.Popover placement="top end">
              <Dropdown.Menu
                aria-label={t`PR actions`}
                onAction={(key) => {
                  if (key === "close") void handleClosePr();
                }}
              >
                <Dropdown.Item id="close" textValue={t`Close PR`} variant="danger">
                  <Label>
                    <Trans>Close PR</Trans>
                  </Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </ButtonGroup>
      )}
      {state !== "merged" && state !== "draft" && (
        <>
          {isBlocked && (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  <Trans>Merging is blocked</Trans>
                </span>
                {canBypass && (
                  <Tooltip>
                    <ToggleButton
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      isSelected={bypass}
                      onChange={setBypass}
                      isDisabled={prLoading}
                      aria-label={t`Bypass branch protection rules`}
                      className="size-5 shrink-0 text-danger data-[selected=true]:bg-danger data-[selected=true]:text-white"
                    >
                      <ShieldOff className="size-3" />
                    </ToggleButton>
                    <Tooltip.Content placement="top">
                      <Trans>Bypass branch protection rules (admin merge)</Trans>
                    </Tooltip.Content>
                  </Tooltip>
                )}
              </div>
              {blockReason && <span className="text-muted">{blockReason}</span>}
            </div>
          )}
          {mergeStateStatus === "BEHIND" && handleUpdatePrBranch && (
            <ButtonGroup className="w-full">
              <Button
                variant="tertiary"
                className="flex-1"
                isDisabled={prLoading}
                isPending={pendingAction === "update"}
                onPress={() => void handleUpdatePrBranch(false)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <PixelLoader size="xs" /> : <RefreshCw className="size-3.5" />}
                    <Trans>Update branch</Trans>
                  </>
                )}
              </Button>
              <Dropdown>
                <Button
                  isIconOnly
                  variant="tertiary"
                  aria-label={t`Update method`}
                  isDisabled={prLoading}
                >
                  <ButtonGroup.Separator />
                  <ChevronDown className="size-3.5" />
                </Button>
                <Dropdown.Popover placement="top end">
                  <Dropdown.Menu
                    aria-label={t`Update method`}
                    onAction={(key) => {
                      if (key === "rebase") void handleUpdatePrBranch(true);
                      else void handleUpdatePrBranch(false);
                    }}
                  >
                    <Dropdown.Item id="merge" textValue={t`Update with merge commit`}>
                      <Label>
                        <Trans>Update with merge commit</Trans>
                      </Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="rebase" textValue={t`Update with rebase`}>
                      <Label>
                        <Trans>Update with rebase</Trans>
                      </Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </ButtonGroup>
          )}
          <ButtonGroup className="w-full">
            <Button
              variant="tertiary"
              className="flex-1"
              isDisabled={prLoading || (isBlocked && !bypass)}
              isPending={pendingAction === "merge"}
              onPress={() => void handleMergePr("squash", bypass)}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <PixelLoader size="xs" /> : <GitMerge className="size-3.5" />}
                  <Trans>Merge PR: Squash</Trans>
                </>
              )}
            </Button>
            <Dropdown>
              <Button
                isIconOnly
                variant="tertiary"
                aria-label={t`Merge options`}
                isDisabled={prLoading}
              >
                <ButtonGroup.Separator />
                <ChevronDown className="size-3.5" />
              </Button>
              <Dropdown.Popover placement="top end">
                <Dropdown.Menu
                  aria-label={t`Merge method`}
                  disabledKeys={isBlocked && !bypass ? ["merge", "squash", "rebase"] : []}
                  onAction={(key) => {
                    if (key === "close") void handleClosePr();
                    else void handleMergePr(key as "merge" | "squash" | "rebase", bypass);
                  }}
                >
                  <Dropdown.Item id="merge" textValue={t`Merge PR: Commit`}>
                    <Label>
                      <Trans>Merge PR: Commit</Trans>
                    </Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="rebase" textValue={t`Merge PR: Rebase`}>
                    <Label>
                      <Trans>Merge PR: Rebase</Trans>
                    </Label>
                  </Dropdown.Item>
                  <Separator />
                  <Dropdown.Item id="close" textValue={t`Close PR`} variant="danger">
                    <Label>
                      <Trans>Close PR</Trans>
                    </Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </ButtonGroup>
        </>
      )}
    </GitReviewSection>
  );
}
