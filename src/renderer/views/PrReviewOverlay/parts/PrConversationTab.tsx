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
  ProjectLocation,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { Button, PixelLoader, TextArea } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";
import { formatShortDateTime } from "@/renderer/utils/formatTime";

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
  | { kind: "review"; at: string; data: PrReviewSummary };

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
  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function PrConversationTab(props: {
  cacheKey: string;
  projectLocation: ProjectLocation;
  prNumber: number;
  loading: boolean;
  onPosted: () => void;
}) {
  const { cacheKey, projectLocation, prNumber, loading, onPosted } = props;
  const { t } = useLingui();
  const details = useGitStore((s) => s.prDetails[cacheKey]);
  const [composerValue, setComposerValue] = useState("");
  const [posting, setPosting] = useState(false);
  const entries = buildTimeline(details);

  async function handlePost() {
    const body = composerValue.trim();
    if (body.length === 0 || posting) return;
    setPosting(true);
    try {
      const comment = await readBridge().ghPostPrComment({
        projectLocation,
        prNumber,
        body,
      });
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
              {entries.map((entry) =>
                entry.kind === "comment" ? (
                  <CommentRow key={`c-${entry.data.id}`} comment={entry.data} />
                ) : (
                  <ReviewRow key={`r-${entry.data.id}`} review={entry.data} />
                ),
              )}
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
            disabled={posting}
            autoSize
            maxRows={6}
            className="min-h-8 flex-1 text-xs"
          />
          <Button
            variant="tertiary"
            size="sm"
            className="h-8 shrink-0 self-start text-white"
            onPress={() => void handlePost()}
            isDisabled={posting || composerValue.trim().length === 0}
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

function CommentRow(props: { comment: PrComment }) {
  const { comment } = props;
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
      <div className="px-3 py-2 text-xs">
        <ItemMarkdown text={comment.body || ""} />
      </div>
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
