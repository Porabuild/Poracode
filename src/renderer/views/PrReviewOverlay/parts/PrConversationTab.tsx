import { useState, type KeyboardEvent } from "react";
import { Check, MessageSquare, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type {
  PrComment,
  PrDetails,
  PrReviewState,
  PrReviewSummary,
  PrReviewThread,
  ProjectLocation,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { reviewClient, reviewSourceIdentity } from "@/renderer/utils/forgeReviews";
import { Button, PixelLoader, TextArea } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { PrCommentBody, type SavePrComment } from "./PrCommentBody";

const REVIEW_STATE_META: Record<
  PrReviewState,
  { label: MessageDescriptor; toneClass: string; Icon: typeof Check }
> = {
  APPROVED: { label: msg`approved`, toneClass: "text-success", Icon: ThumbsUp },
  CHANGES_REQUESTED: {
    label: msg`requested changes`,
    toneClass: "text-danger",
    Icon: ThumbsDown,
  },
  COMMENTED: { label: msg`commented`, toneClass: "text-muted", Icon: MessageSquare },
  DISMISSED: { label: msg`dismissed review`, toneClass: "text-muted/60", Icon: MessageSquare },
  PENDING: { label: msg`pending review`, toneClass: "text-warning", Icon: MessageSquare },
};

type TimelineEntry =
  | { kind: "comment"; at: string; data: PrComment }
  | { kind: "review"; at: string; data: PrReviewSummary }
  | { kind: "thread"; at: string; data: PrReviewThread };

function buildTimeline(details: PrDetails | undefined): TimelineEntry[] {
  if (!details) return [];
  const entries: TimelineEntry[] = [];
  for (const c of details.comments) {
    entries.push({ kind: "comment", at: c.createdAt, data: c });
  }
  for (const r of details.reviews) {
    // Skip reviews with no body that aren't approvals/change-requests — they're
    // just empty drive-bys from the API and only add noise.
    if (!r.body && r.state !== "APPROVED" && r.state !== "CHANGES_REQUESTED") continue;
    entries.push({ kind: "review", at: r.submittedAt ?? "", data: r });
  }
  for (const thread of details.reviewThreads ?? []) {
    entries.push({ kind: "thread", at: thread.comments[0]?.createdAt ?? "", data: thread });
  }
  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function PrConversationTab(props: {
  cacheKey: string;
  prKey: string;
  projectLocation: ProjectLocation;
  prNumber: number;
  loading: boolean;
  readOnly?: boolean;
  onPosted: () => void;
}) {
  const { cacheKey, prKey, projectLocation, prNumber, loading, readOnly = false, onPosted } = props;
  const { t } = useLingui();
  const details = useGitStore((s) =>
    s.prData[prKey] !== null &&
    (!s.prData[prKey] || s.prData[prKey]?.number === prNumber) &&
    s.prDetails[cacheKey]?.number === prNumber &&
    reviewSourceIdentity(s.prDetails[cacheKey]?.source) ===
      reviewSourceIdentity(s.prData[prKey]?.source)
      ? s.prDetails[cacheKey]
      : undefined,
  );
  const [composerValue, setComposerValue] = useState("");
  const [posting, setPosting] = useState(false);
  const entries = buildTimeline(details);
  const sourceIdentity = reviewSourceIdentity(details?.source);

  function commentEditor(comment: PrComment, threadId?: string): SavePrComment | undefined {
    const source = details?.source;
    const kind = threadId ? "inline" : "conversation";
    if (
      !source?.account ||
      !source.capabilities.commentEditing?.includes(kind) ||
      comment.author.login.toLowerCase() !== source.account.login.toLowerCase()
    )
      return undefined;
    const account = source.account;
    return async (body, expectedBody) => {
      const isCurrent = () => {
        const current = useGitStore.getState().prData[prKey];
        return (
          current?.number === prNumber && reviewSourceIdentity(current.source) === sourceIdentity
        );
      };
      if (readOnly || loading || !isCurrent()) return false;
      try {
        await reviewClient(source).editComment({
          projectLocation,
          prNumber,
          commentId: comment.id,
          body,
          expectedBody,
          forgeAccount: account,
          forgeRepository: source.repository,
          ...(threadId ? { threadId } : {}),
        });
        if (!isCurrent()) return false;
        toast.success(t`Comment updated`);
        onPosted();
        return true;
      } catch (error) {
        if (isCurrent()) toast.danger(friendlyError(error));
        return false;
      }
    };
  }

  async function handlePost() {
    const body = composerValue.trim();
    if (readOnly || !details || body.length === 0 || posting) return;
    const isCurrent = () => {
      const currentPr = useGitStore.getState().prData[prKey];
      return (
        currentPr !== null &&
        (!currentPr || currentPr.number === prNumber) &&
        reviewSourceIdentity(currentPr?.source) === reviewSourceIdentity(details.source)
      );
    };
    if (!isCurrent()) return;
    setPosting(true);
    try {
      const comment = await reviewClient(details.source).comment({
        projectLocation,
        prNumber,
        body,
      });
      if (!isCurrent()) return;
      useGitStore.getState().appendPrComment(cacheKey, comment);
      setComposerValue("");
      toast.success(t`Comment posted`);
      onPosted();
    } catch (err) {
      toast.danger(friendlyError(err));
    } finally {
      setPosting(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter submits — consistent with the chat composer.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handlePost();
    }
  }

  if (loading && !details) {
    return (
      <div className="flex h-full items-center justify-center">
        <PixelLoader size="md" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted/60">
              <Trans>No conversation yet. Be the first to comment.</Trans>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => {
                if (entry.kind === "comment") {
                  const onSave = commentEditor(entry.data);
                  return (
                    <CommentRow
                      key={`${sourceIdentity}:c-${entry.data.id}`}
                      comment={entry.data}
                      disabled={loading || readOnly}
                      {...(onSave ? { onSave } : {})}
                    />
                  );
                }
                return entry.kind === "review" ? (
                  <ReviewRow key={`r-${entry.data.id}`} review={entry.data} />
                ) : (
                  <ReviewThreadRow
                    key={`${sourceIdentity}:t-${entry.data.id}`}
                    thread={entry.data}
                    disabled={loading || readOnly}
                    commentEditor={commentEditor}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-[color:var(--border)] py-3">
        <div className="mx-auto flex w-full max-w-3xl items-stretch gap-2 px-6">
          <TextArea
            aria-label={t`Write a comment`}
            placeholder={t`Write a comment…`}
            value={composerValue}
            onChange={(e) => setComposerValue(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={readOnly || !details || posting}
            autoSize
            maxRows={6}
            className="min-h-8 flex-1 text-xs"
          />
          <Button
            variant="tertiary"
            size="sm"
            className="h-8 shrink-0 self-start text-white"
            onPress={() => void handlePost()}
            isDisabled={readOnly || !details || posting || composerValue.trim().length === 0}
            isPending={posting}
          >
            {({ isPending }) => (
              <>
                {isPending ? <PixelLoader size="xs" /> : <Send className="size-3.5" />}
                <Trans>Comment</Trans>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuthorAvatar(props: { login: string }) {
  const initial = props.login.slice(0, 1).toUpperCase();
  return (
    <div
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[10px] font-semibold uppercase text-foreground"
      aria-hidden
    >
      {initial}
    </div>
  );
}

function CommentRow(props: { comment: PrComment; disabled: boolean; onSave?: SavePrComment }) {
  const { comment, disabled, onSave } = props;
  return (
    <li className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30">
      <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-foreground/[0.03] px-3 py-1.5 text-xs">
        <AuthorAvatar login={comment.author.login} />
        <span className="font-medium text-foreground">{comment.author.login}</span>
        <span className="text-muted">
          <Trans>commented</Trans>
        </span>
        {comment.createdAt && (
          <span className="text-muted/60">· {formatShortDateTime(comment.createdAt)}</span>
        )}
      </div>
      <PrCommentBody
        key={comment.id}
        body={comment.body}
        disabled={disabled}
        {...(onSave ? { onSave } : {})}
      />
    </li>
  );
}

function ReviewRow(props: { review: PrReviewSummary }) {
  const { review } = props;
  const { t } = useLingui();
  const meta = REVIEW_STATE_META[review.state];
  const Icon = meta.Icon;
  return (
    <li className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30">
      <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-foreground/[0.03] px-3 py-1.5 text-xs">
        <AuthorAvatar login={review.author.login} />
        <span className="font-medium text-foreground">{review.author.login}</span>
        <span className={`flex items-center gap-1 ${meta.toneClass}`}>
          <Icon className="size-3.5" />
          {t(meta.label)}
        </span>
        {review.submittedAt && (
          <span className="text-muted/60">· {formatShortDateTime(review.submittedAt)}</span>
        )}
      </div>
      {review.body && (
        <div className="px-3 py-2 text-xs">
          <ItemMarkdown text={review.body} />
        </div>
      )}
    </li>
  );
}

function ReviewThreadRow({
  thread,
  disabled,
  commentEditor,
}: {
  thread: PrReviewThread;
  disabled: boolean;
  commentEditor: (comment: PrComment, threadId: string) => SavePrComment | undefined;
}) {
  return (
    <li className="rounded-2xl border border-[color:var(--border)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {thread.path && (
          <span className="break-all font-mono text-foreground">
            {thread.path}
            {thread.line ? `:${thread.line}` : ""}
          </span>
        )}
        <span>{thread.isResolved ? <Trans>Resolved</Trans> : <Trans>Unresolved</Trans>}</span>
        {thread.isOutdated && (
          <span>
            <Trans>Outdated</Trans>
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {thread.comments.map((comment) => {
          const onSave = commentEditor(comment, thread.id);
          return (
            <CommentRow
              key={comment.id}
              comment={comment}
              disabled={disabled}
              {...(onSave ? { onSave } : {})}
            />
          );
        })}
      </ul>
    </li>
  );
}
