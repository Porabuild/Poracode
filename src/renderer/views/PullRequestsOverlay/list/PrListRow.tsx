import {
  CircleCheck,
  CircleDot,
  CircleX,
  Eye,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from "lucide-react";
import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { sidebarRowClass } from "@/renderer/components/common/SidebarButton";
import { getPrStatusTone, PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";
import { PrAvatar } from "../parts/PrAvatar";
import { PrLabelChip } from "../parts/PrLabelChip";
import type { PullRequestEntry } from "./prListModel";

export function PrStateIcon(props: {
  entry: PullRequestEntry["summary"]["pr"];
  className?: string;
}) {
  const { entry: pr } = props;
  const tone = PR_TONE_TEXT_CLASS[getPrStatusTone(pr.state, pr.checksStatus, pr)];
  const className = `size-3.5 shrink-0 ${tone} ${props.className ?? ""}`;
  if (pr.state === "merged") return <GitMerge className={className} aria-hidden />;
  if (pr.state === "closed") return <GitPullRequestClosed className={className} aria-hidden />;
  if (pr.isDraft) return <GitPullRequestDraft className={className} aria-hidden />;
  return <GitPullRequest className={className} aria-hidden />;
}

function ChecksIcon(props: { status: string | undefined }) {
  const { t } = useLingui();
  if (props.status === "SUCCESS")
    return <CircleCheck className="size-3.5 text-success" aria-label={t`Checks passed`} />;
  if (props.status === "FAILURE")
    return <CircleX className="size-3.5 text-danger" aria-label={t`Checks failed`} />;
  if (props.status === "PENDING")
    return <CircleDot className="size-3.5 text-warning" aria-label={t`Checks running`} />;
  return null;
}

function ReviewIcon(props: { decision: string | undefined; requested: boolean }) {
  const { t } = useLingui();
  if (props.decision === "APPROVED")
    return <CircleCheck className="size-3.5 text-success" aria-label={t`Approved`} />;
  if (props.decision === "CHANGES_REQUESTED")
    return <CircleX className="size-3.5 text-warning" aria-label={t`Changes requested`} />;
  if (props.requested)
    return <Eye className="size-3.5 text-accent" aria-label={t`Your review is requested`} />;
  return null;
}

export function PrListRow(props: {
  entry: PullRequestEntry;
  selected: boolean;
  showRepository: boolean;
  onOpen: () => void;
}) {
  const { t } = useLingui();
  const { summary } = props.entry;
  const sharedClass = sidebarRowClass({ size: "xs", density: "compact" }).replace(
    "items-center",
    "items-start",
  );
  const rowClass = props.selected
    ? `${sharedClass
        .replace(" text-muted", "")
        .replace(
          " hover:bg-[var(--row-hover)] hover:text-foreground",
          "",
        )} bg-[var(--row-active)] text-foreground`
    : sharedClass;
  return (
    <Tooltip delay={500}>
      <Tooltip.Trigger className="flex w-full min-h-0 flex-col" tabIndex={-1} role="none">
        <button
          type="button"
          aria-current={props.selected ? "true" : undefined}
          className={rowClass}
          onClick={props.onOpen}
        >
          <PrStateIcon entry={summary.pr} className="mt-[3px]" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-0.5">
            <span className="flex h-[18px] min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {summary.pr.title}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted">
                <RelativeTime iso={summary.pr.updatedAt} />
              </span>
            </span>
            <span className="flex h-[18px] min-w-0 items-center gap-1 text-[10px] text-muted">
              {summary.author ? <PrAvatar author={summary.author} size="xs" /> : null}
              <span className="min-w-0 flex-1 truncate">
                {summary.author ? (
                  <>
                    {summary.author.login}
                    <span aria-hidden className="px-1 text-muted/50">
                      ·
                    </span>
                  </>
                ) : null}
                <span className="tabular-nums">#{summary.pr.number}</span>
                {props.showRepository ? (
                  <>
                    <span aria-hidden className="px-1 text-muted/50">
                      ·
                    </span>
                    {summary.repository}
                  </>
                ) : null}
              </span>
              <span
                className="flex shrink-0 items-center gap-1 font-medium tabular-nums"
                aria-label={t`${summary.additions} additions and ${summary.deletions} deletions`}
              >
                <span className="text-success" aria-hidden>
                  +{summary.additions}
                </span>
                <span className="text-danger" aria-hidden>
                  −{summary.deletions}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <ChecksIcon status={summary.pr.checksStatus} />
                <ReviewIcon
                  decision={summary.pr.reviewDecision}
                  requested={summary.reviewRequested}
                />
              </span>
            </span>
            {summary.labels && summary.labels.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-1 pt-0.5">
                {summary.labels.map((label) => (
                  <PrLabelChip key={label.name} label={label} size="xs" />
                ))}
              </span>
            ) : null}
          </span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="right" showArrow className="max-w-[28rem] text-xs">
        #{summary.pr.number} {summary.pr.title}
      </Tooltip.Content>
    </Tooltip>
  );
}
