import type { ReactNode } from "react";
import {
  GitCommitHorizontal,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { PrAuthor, PrReviewState } from "@/shared/contracts";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import { PrAvatar } from "../parts/PrAvatar";
import { usePrDetailNav } from "../detail/prDetailNav";
import { PrReviewThreadSideMarker } from "../parts/PrReviewThreadSideMarker";
import { Actor, EVENT_KIND_META, TimelineEventPhrase } from "./TimelineEventPhrase";
import type { PrTimelineEntry } from "./prTimelineModel";

const EXCERPT_LINES = 3;
const EXCERPT_CHARS = 320;

/** First few lines of a markdown body as plain text, for the rail. */
export function excerptOf(body: string): string {
  const lines = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, EXCERPT_LINES)
    .join("\n");
  return lines.length > EXCERPT_CHARS ? `${lines.slice(0, EXCERPT_CHARS).trimEnd()}…` : lines;
}

const REVIEW_STATE_META: Record<
  PrReviewState,
  { label: MessageDescriptor; tone: string; Icon: LucideIcon }
> = {
  APPROVED: { label: msg`Approved`, tone: "text-success", Icon: ThumbsUp },
  CHANGES_REQUESTED: { label: msg`Changes requested`, tone: "text-danger", Icon: ThumbsDown },
  COMMENTED: { label: msg`Commented`, tone: "text-muted", Icon: MessageSquare },
  DISMISSED: { label: msg`Dismissed`, tone: "text-muted", Icon: MessageSquare },
  PENDING: { label: msg`Pending`, tone: "text-warning", Icon: MessageSquare },
};

function TimeStamp(props: { entry: PrTimelineEntry }) {
  const { at, time } = props.entry;
  if (!at || Number.isNaN(time)) return null;
  return (
    <time dateTime={at} title={formatShortDateTime(at)} className="shrink-0 text-xs text-muted">
      <RelativeTime iso={at} />
    </time>
  );
}

function Dot(props: { Icon: LucideIcon; tone: string }) {
  return (
    <span
      aria-hidden
      className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-surface ${props.tone}`}
    >
      <props.Icon className="size-3.5" />
    </span>
  );
}

function Row(props: {
  icon: LucideIcon;
  tone: string;
  entry: PrTimelineEntry;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-4" data-timeline-type={props.entry.type}>
      <Dot Icon={props.icon} tone={props.tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">{props.children}</div>
    </li>
  );
}

function HeaderLine(props: {
  entry: PrTimelineEntry;
  author?: PrAuthor | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
      {props.author ? <PrAvatar author={props.author} size="xs" /> : null}
      {props.children}
      <TimeStamp entry={props.entry} />
    </div>
  );
}

function ExcerptButton(props: { body: string; label: string; onPress: () => void }) {
  const text = excerptOf(props.body);
  if (!text) return null;
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onPress}
      className="w-full cursor-pointer whitespace-pre-line rounded-xl border border-[color:var(--border)] bg-surface-tertiary/30 px-3 py-2 text-left text-xs text-foreground/90 transition-colors hover:bg-surface-tertiary/60"
    >
      {text}
    </button>
  );
}

/** One entry on the timeline rail. */
export function TimelineEntryRow(props: { entry: PrTimelineEntry }) {
  const { t } = useLingui();
  const nav = usePrDetailNav();
  const { entry } = props;

  switch (entry.type) {
    case "event": {
      const meta = EVENT_KIND_META[entry.event.kind];
      return (
        <Row icon={meta.Icon} tone={meta.tone} entry={entry}>
          <HeaderLine entry={entry} author={entry.event.actor}>
            <span className="min-w-0">
              <TimelineEventPhrase event={entry.event} />
            </span>
          </HeaderLine>
        </Row>
      );
    }
    case "commit": {
      const { commit } = entry;
      const headline = commit.messageHeadline.split(/\r?\n/u)[0] ?? "";
      const sha = commit.abbreviatedOid || commit.oid.slice(0, 7);
      return (
        <Row icon={GitCommitHorizontal} tone="text-muted" entry={entry}>
          <HeaderLine entry={entry} author={commit.author}>
            <Trans>
              <Actor author={commit.author} /> committed
            </Trans>
          </HeaderLine>
          <button
            type="button"
            aria-label={t`Show changes of commit ${sha}`}
            onClick={() => {
              nav.setCommitScope(commit.oid);
              nav.setTab("changes");
            }}
            className="flex w-full min-w-0 cursor-pointer items-baseline gap-2 rounded-xl border border-[color:var(--border)] bg-surface-tertiary/30 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-tertiary/60"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">{headline}</span>
            <code className="shrink-0 font-mono text-[11px] text-muted">{sha}</code>
          </button>
        </Row>
      );
    }
    case "review": {
      const { review } = entry;
      const meta = REVIEW_STATE_META[review.state];
      return (
        <Row icon={meta.Icon} tone={meta.tone} entry={entry}>
          <HeaderLine entry={entry} author={review.author}>
            <Trans>
              <Actor author={review.author} /> reviewed
            </Trans>
            <span
              className={`rounded-full border border-[color:var(--border)] px-1.5 text-[11px] font-medium ${meta.tone}`}
            >
              {t(meta.label)}
            </span>
          </HeaderLine>
          <ExcerptButton
            body={review.body}
            label={t`Open review by ${review.author.login}`}
            onPress={() => nav.setTab("summary")}
          />
        </Row>
      );
    }
    case "comment": {
      const { comment } = entry;
      return (
        <Row icon={MessageSquare} tone="text-muted" entry={entry}>
          <HeaderLine entry={entry} author={comment.author}>
            <Trans>
              <Actor author={comment.author} /> commented
            </Trans>
          </HeaderLine>
          <ExcerptButton
            body={comment.body}
            label={t`Open comment by ${comment.author.login}`}
            onPress={() => nav.setTab("summary")}
          />
        </Row>
      );
    }
    case "thread": {
      const { thread, first } = entry;
      const path = thread.path;
      const line = thread.line;
      const location = path ? (line !== undefined ? `${path}:${line}` : path) : undefined;
      return (
        <Row icon={MessageSquare} tone="text-muted" entry={entry}>
          <HeaderLine entry={entry} author={first.author}>
            {location ? (
              <Trans>
                <Actor author={first.author} /> commented on{" "}
                <code className="font-mono text-[11px] text-foreground">{location}</code>
              </Trans>
            ) : (
              <Trans>
                <Actor author={first.author} /> started a review thread
              </Trans>
            )}
            <PrReviewThreadSideMarker side={thread.side} />
            {thread.isResolved ? (
              <span className="rounded-full border border-[color:var(--border)] px-1.5 text-[11px] text-success">
                <Trans>Resolved</Trans>
              </span>
            ) : null}
            {thread.isOutdated ? (
              <span className="rounded-full border border-[color:var(--border)] px-1.5 text-[11px] text-muted">
                <Trans>Outdated</Trans>
              </span>
            ) : null}
          </HeaderLine>
          <ExcerptButton
            body={first.body}
            label={location ? t`Open ${location} in changes` : t`Open thread in summary`}
            onPress={() => {
              if (path) nav.openFile(path, line, thread.side);
              else nav.setTab("summary");
            }}
          />
        </Row>
      );
    }
  }
}
