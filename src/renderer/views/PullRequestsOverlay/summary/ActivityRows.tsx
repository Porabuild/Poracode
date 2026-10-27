import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { PrComment, PrReviewState, PrReviewSummary, PrReviewThread } from "@/shared/contracts";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { PrAvatar } from "../parts/PrAvatar";
import { PrCommentBody, type SavePrComment } from "../parts/PrCommentBody";
import { PrReactionAdd, PrReactionChips } from "../parts/PrReactions";
import { PrReviewThreadSideMarker } from "../parts/PrReviewThreadSideMarker";
import { usePrDetailNav } from "../detail/prDetailNav";
import { useSubjectReactions } from "./SubjectReactions";

const REVIEW_STATE_META: Record<
  PrReviewState,
  { label: MessageDescriptor; toneClass: string; Icon: typeof MessageSquare }
> = {
  APPROVED: { label: msg`approved`, toneClass: "text-success", Icon: ThumbsUp },
  CHANGES_REQUESTED: { label: msg`requested changes`, toneClass: "text-danger", Icon: ThumbsDown },
  COMMENTED: { label: msg`commented`, toneClass: "text-muted", Icon: MessageSquare },
  DISMISSED: { label: msg`dismissed review`, toneClass: "text-muted/60", Icon: MessageSquare },
  PENDING: { label: msg`pending review`, toneClass: "text-warning", Icon: MessageSquare },
};

const CARD_CLASS =
  "overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30";
const CARD_HEADER_CLASS =
  "flex items-center gap-2 border-b border-[color:var(--border)] bg-foreground/[0.03] px-3 py-1.5 text-xs";

export function CommentRow(props: {
  comment: PrComment;
  disabled: boolean;
  onSave?: SavePrComment | undefined;
}) {
  const { comment, disabled, onSave } = props;
  const reactions = useSubjectReactions({ subjectId: comment.id, reactions: comment.reactions });
  const hasReactions = comment.reactions?.some((reaction) => reaction.count > 0) === true;
  return (
    <li className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <PrAvatar author={comment.author} />
        <span className="font-medium text-foreground">{comment.author.login}</span>
        <span className="text-muted">
          <Trans>commented</Trans>
        </span>
        {comment.createdAt ? (
          <span className="text-muted/60">· {formatShortDateTime(comment.createdAt)}</span>
        ) : null}
        <PrReactionAdd {...reactions} className="-my-1 ml-auto flex shrink-0 items-center" />
      </div>
      <PrCommentBody
        key={comment.id}
        body={comment.body}
        disabled={disabled}
        {...(onSave ? { onSave } : {})}
      />
      {hasReactions ? (
        <div className="px-3 pb-2">
          <PrReactionChips {...reactions} />
        </div>
      ) : null}
    </li>
  );
}

export function ReviewRow(props: { review: PrReviewSummary }) {
  const { review } = props;
  const { t } = useLingui();
  const meta = REVIEW_STATE_META[review.state];
  const Icon = meta.Icon;
  return (
    <li className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <PrAvatar author={review.author} />
        <span className="font-medium text-foreground">{review.author.login}</span>
        <span className={`flex items-center gap-1 ${meta.toneClass}`}>
          <Icon className="size-3.5" />
          {t(meta.label)}
        </span>
        {review.submittedAt ? (
          <span className="text-muted/60">· {formatShortDateTime(review.submittedAt)}</span>
        ) : null}
      </div>
      {review.body ? (
        <div className="px-3 py-2 text-xs">
          <ItemMarkdown text={review.body} />
        </div>
      ) : null}
    </li>
  );
}

export function ReviewThreadRow(props: {
  thread: PrReviewThread;
  disabled: boolean;
  commentEditor: (comment: PrComment, threadId: string) => SavePrComment | undefined;
}) {
  const { thread, disabled, commentEditor } = props;
  const { t } = useLingui();
  const nav = usePrDetailNav();
  const compact = useCompactLayout();
  const path = thread.path;
  const location = path
    ? `${path}${thread.line !== undefined ? `:${thread.line}` : ""}`
    : undefined;
  return (
    <li className={`rounded-2xl border border-[color:var(--border)] ${compact ? "p-2" : "p-3"}`}>
      <div
        className={`flex flex-wrap items-center gap-2 text-xs text-muted ${compact ? "mb-1" : "mb-2"}`}
      >
        {path && location ? (
          <button
            type="button"
            aria-label={t`Open ${location} in changes`}
            onClick={() => nav.openFile(path, thread.line, thread.side)}
            className="break-all font-mono text-left text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {location}
          </button>
        ) : null}
        <PrReviewThreadSideMarker side={thread.side} />
        <span className={thread.isResolved ? "text-success" : "text-warning"}>
          {thread.isResolved ? <Trans>Resolved</Trans> : <Trans>Unresolved</Trans>}
        </span>
        {thread.isOutdated ? (
          <span>
            <Trans>Outdated</Trans>
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {thread.comments.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            disabled={disabled}
            onSave={commentEditor(comment, thread.id)}
          />
        ))}
      </ul>
    </li>
  );
}
