import type { ReactNode } from "react";
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Info,
  Pencil,
  RefreshCw,
  Tag,
  UserMinus,
  UserPlus,
  CircleDot,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrAuthor, PrReviewer, PrTimelineEventKind } from "@/shared/contracts";
import { PrLabelChip } from "../parts/PrLabelChip";
import type { PrKnownTimelineEvent } from "./prTimelineModel";

export interface TimelineKindMeta {
  Icon: LucideIcon;
  /** Tone class for the rail dot. */
  tone: string;
}

export const EVENT_KIND_META: Record<PrTimelineEventKind, TimelineKindMeta> = {
  opened: { Icon: GitPullRequest, tone: "text-success" },
  closed: { Icon: GitPullRequestClosed, tone: "text-danger" },
  reopened: { Icon: CircleDot, tone: "text-success" },
  merged: { Icon: GitMerge, tone: "text-accent" },
  ready: { Icon: GitPullRequest, tone: "text-success" },
  draft: { Icon: GitPullRequestDraft, tone: "text-muted" },
  labeled: { Icon: Tag, tone: "text-muted" },
  unlabeled: { Icon: Tag, tone: "text-muted" },
  "review-requested": { Icon: UserPlus, tone: "text-muted" },
  "review-request-removed": { Icon: UserMinus, tone: "text-muted" },
  "force-pushed": { Icon: RefreshCw, tone: "text-warning" },
  "base-changed": { Icon: GitBranch, tone: "text-muted" },
  renamed: { Icon: Pencil, tone: "text-muted" },
  system: { Icon: Info, tone: "text-muted" },
};

export function Actor(props: { author: PrAuthor | undefined }) {
  const { t } = useLingui();
  return <span className="font-medium text-foreground">{props.author?.login ?? t`Someone`}</span>;
}

function Ref(props: { children: ReactNode }) {
  return (
    <code className="rounded bg-default-100 px-1 py-px font-mono text-[11px] text-foreground">
      {props.children}
    </code>
  );
}

/** Hosts report force-push endpoints as full commit ids; show the short form. */
function shortRef(ref: string | undefined): string {
  if (!ref) return "";
  return /^[0-9a-f]{40,64}$/iu.test(ref) ? ref.slice(0, 7) : ref;
}

function reviewerName(reviewer: PrReviewer): string {
  return reviewer.name || reviewer.login;
}

/** The sentence for one lifecycle event; the actor is its subject. */
export function TimelineEventPhrase(props: { event: PrKnownTimelineEvent }) {
  const { event } = props;
  const author = event.actor;
  const fromRef = event.fromRef;
  const toRef = event.toRef;
  switch (event.kind) {
    case "opened":
      return (
        <Trans>
          <Actor author={author} /> opened this
        </Trans>
      );
    case "closed":
      return (
        <Trans>
          <Actor author={author} /> closed this
        </Trans>
      );
    case "reopened":
      return (
        <Trans>
          <Actor author={author} /> reopened this
        </Trans>
      );
    case "merged":
      return (
        <Trans>
          <Actor author={author} /> merged this
        </Trans>
      );
    case "ready":
      return (
        <Trans>
          <Actor author={author} /> marked this as ready for review
        </Trans>
      );
    case "draft":
      return (
        <Trans>
          <Actor author={author} /> marked this as a draft
        </Trans>
      );
    case "labeled":
      return event.label ? (
        <Trans>
          <Actor author={author} /> labeled <PrLabelChip label={event.label} />
        </Trans>
      ) : null;
    case "unlabeled":
      return event.label ? (
        <Trans>
          <Actor author={author} /> removed the label <PrLabelChip label={event.label} />
        </Trans>
      ) : null;
    case "review-requested": {
      const reviewer = event.reviewer ? reviewerName(event.reviewer) : "";
      return reviewer ? (
        <Trans>
          <Actor author={author} /> requested review from{" "}
          <span className="font-medium text-foreground">{reviewer}</span>
        </Trans>
      ) : null;
    }
    case "review-request-removed": {
      const reviewer = event.reviewer ? reviewerName(event.reviewer) : "";
      return reviewer ? (
        <Trans>
          <Actor author={author} /> removed the review request for{" "}
          <span className="font-medium text-foreground">{reviewer}</span>
        </Trans>
      ) : null;
    }
    case "force-pushed": {
      const from = shortRef(fromRef);
      const to = shortRef(toRef);
      return from && to ? (
        <Trans>
          <Actor author={author} /> force-pushed <Ref>{from}</Ref> → <Ref>{to}</Ref>
        </Trans>
      ) : (
        <Trans>
          <Actor author={author} /> force-pushed
        </Trans>
      );
    }
    case "base-changed":
      return fromRef && toRef ? (
        <Trans>
          <Actor author={author} /> changed the base branch from <Ref>{fromRef}</Ref> to{" "}
          <Ref>{toRef}</Ref>
        </Trans>
      ) : (
        <Trans>
          <Actor author={author} /> changed the base branch
        </Trans>
      );
    case "renamed":
      return fromRef && toRef ? (
        <Trans>
          <Actor author={author} /> renamed this from “{fromRef}” to “{toRef}”
        </Trans>
      ) : (
        <Trans>
          <Actor author={author} /> renamed this
        </Trans>
      );
    case "system":
      return <span>{event.text}</span>;
  }
}
