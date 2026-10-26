/**
 * GitHub GraphQL documents and pure mappers for review metadata that `gh pr
 * view --json` cannot supply: viewer-aware reactions and the lifecycle event
 * feed. Every function here is pure (raw in → typed value out).
 */

import type {
  PrAuthor,
  PrComment,
  PrDetails,
  PrReaction,
  PrReactionContent,
  PrReviewer,
  PrTimelineEvent,
} from "@/shared/contracts";
import { lifecycleEvents, object, rows, str } from "./forges/types";
import { mapPrAuthor, mapPrLabel } from "./githubMappers";

/** GitHub `ReactionContent` enum values for the shared reaction names. */
export const GITHUB_REACTION_CONTENT: Record<PrReactionContent, string> = {
  "+1": "THUMBS_UP",
  "-1": "THUMBS_DOWN",
  laugh: "LAUGH",
  hooray: "HOORAY",
  confused: "CONFUSED",
  heart: "HEART",
  rocket: "ROCKET",
  eyes: "EYES",
};
const SHARED_REACTION_CONTENT = new Map(
  Object.entries(GITHUB_REACTION_CONTENT).map(([shared, github]) => [github, shared]),
);

// Only events the timeline renders; commits, comments and reviews already have
// their own arrays and are deliberately not requested here.
const TIMELINE_ITEM_TYPES = [
  "CLOSED_EVENT",
  "REOPENED_EVENT",
  "MERGED_EVENT",
  "READY_FOR_REVIEW_EVENT",
  "CONVERT_TO_DRAFT_EVENT",
  "LABELED_EVENT",
  "UNLABELED_EVENT",
  "REVIEW_REQUESTED_EVENT",
  "REVIEW_REQUEST_REMOVED_EVENT",
  "HEAD_REF_FORCE_PUSHED_EVENT",
  "BASE_REF_CHANGED_EVENT",
  "RENAMED_TITLE_EVENT",
].join(", ");

/**
 * One read for description reactions, the latest 100 conversation comments'
 * reactions, and the latest 100 lifecycle events. Older comments keep no
 * reactions field rather than a guessed one.
 *
 * `User.name` is nullable and `Team.name` is not; GraphQL's field-merging rule
 * rejects one response key with two nullabilities, so the `reviewer` fragment
 * aliases the team fields (`teamName`, `teamAvatarUrl`).
 */
export const PR_METADATA_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reactionGroups { ...reactions }
        comments(last: 100) { nodes { id reactionGroups { ...reactions } } }
        timelineItems(last: 100, itemTypes: [${TIMELINE_ITEM_TYPES}]) {
          nodes {
            __typename
            ... on ClosedEvent { id createdAt actor { ...actor } }
            ... on ReopenedEvent { id createdAt actor { ...actor } }
            ... on MergedEvent { id createdAt actor { ...actor } mergeRefName }
            ... on ReadyForReviewEvent { id createdAt actor { ...actor } }
            ... on ConvertToDraftEvent { id createdAt actor { ...actor } }
            ... on LabeledEvent { id createdAt actor { ...actor } label { ...label } }
            ... on UnlabeledEvent { id createdAt actor { ...actor } label { ...label } }
            ... on ReviewRequestedEvent {
              id createdAt actor { ...actor } requestedReviewer { ...reviewer }
            }
            ... on ReviewRequestRemovedEvent {
              id createdAt actor { ...actor } requestedReviewer { ...reviewer }
            }
            ... on HeadRefForcePushedEvent {
              id createdAt actor { ...actor } beforeCommit { oid } afterCommit { oid }
            }
            ... on BaseRefChangedEvent {
              id createdAt actor { ...actor } previousRefName currentRefName
            }
            ... on RenamedTitleEvent { id createdAt actor { ...actor } previousTitle currentTitle }
          }
        }
      }
    }
  }
  fragment reactions on ReactionGroup { content viewerHasReacted reactors { totalCount } }
  fragment actor on Actor { login avatarUrl }
  fragment label on Label { name color description }
  fragment reviewer on RequestedReviewer {
    __typename
    ... on User { login name avatarUrl }
    ... on Team { combinedSlug teamName: name teamAvatarUrl: avatarUrl }
  }
`;

export const REVIEWER_USERS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $search: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { author { login } }
      assignableUsers(query: $search, first: 40) { totalCount nodes { login name avatarUrl } }
    }
  }
`;

// Teams are requestable only on organization repositories and readable only
// with `read:org`; callers treat a failure as "no teams".
export const REVIEWER_TEAMS_QUERY = `
  query($owner: String!, $search: String) {
    organization(login: $owner) {
      teams(query: $search, first: 10) { totalCount nodes { combinedSlug name avatarUrl } }
    }
  }
`;

/**
 * Resolves the review's node id and, for a comment, the review that owns it.
 * The two comment types declare `pullRequest` with different nullability, so
 * each gets its own response key.
 */
export const REACTION_SUBJECT_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $subject: ID!) {
    repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
    node(id: $subject) {
      ... on IssueComment { conversationReview: pullRequest { id } }
      ... on PullRequestReviewComment { inlineReview: pullRequest { id } }
    }
  }
`;

/** The id of the review that owns the comment node in a {@link REACTION_SUBJECT_QUERY} response. */
export function reactionSubjectReviewId(node: unknown): unknown {
  const value = object(node);
  return object(value.conversationReview ?? value.inlineReview).id;
}

export function reactionMutation(reacted: boolean): string {
  const operation = reacted ? "addReaction" : "removeReaction";
  return `mutation($subject: ID!, $content: ReactionContent!) { ${operation}(input: {subjectId: $subject, content: $content}) { clientMutationId } }`;
}

type Raw = Record<string, unknown>;

function mapReactions(raw: unknown): PrReaction[] {
  return rows(raw).flatMap((group) => {
    const content = SHARED_REACTION_CONTENT.get(String(group.content));
    const count = object(group.reactors).totalCount;
    if (!content || typeof count !== "number" || count < 1) return [];
    return [{ content, count, viewerReacted: group.viewerHasReacted === true }];
  });
}

export function mapRequestedReviewer(raw: unknown): PrReviewer | undefined {
  const value = object(raw);
  if (value.__typename === "Team") {
    const slug = str(value.combinedSlug) || undefined;
    if (!slug) return undefined;
    const name = str(value.teamName) || str(value.name) || undefined;
    const avatarUrl = str(value.teamAvatarUrl) || str(value.avatarUrl) || undefined;
    return {
      id: slug,
      login: slug,
      ...(name ? { name } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      team: true,
    };
  }
  const login = str(value.login) || undefined;
  if (!login) return undefined;
  const name = str(value.name) || undefined;
  const avatarUrl = str(value.avatarUrl) || undefined;
  return {
    id: login,
    login,
    ...(name ? { name } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mapTimelineEvent(raw: Raw): PrTimelineEvent | undefined {
  const id = str(raw.id) || undefined;
  const createdAt = str(raw.createdAt) || undefined;
  if (!id || !createdAt) return undefined;
  const actor = mapPrAuthor(raw.actor);
  const base = { id, createdAt, ...(actor ? { actor } : {}) };
  const refs = (from: unknown, to: unknown) => {
    const fromRef = str(from) || undefined;
    const toRef = str(to) || undefined;
    return { ...(fromRef ? { fromRef } : {}), ...(toRef ? { toRef } : {}) };
  };
  switch (raw.__typename) {
    case "ClosedEvent":
      return { ...base, kind: "closed" };
    case "ReopenedEvent":
      return { ...base, kind: "reopened" };
    case "MergedEvent":
      return { ...base, kind: "merged", ...refs(undefined, raw.mergeRefName) };
    case "ReadyForReviewEvent":
      return { ...base, kind: "ready" };
    case "ConvertToDraftEvent":
      return { ...base, kind: "draft" };
    case "LabeledEvent":
    case "UnlabeledEvent": {
      const label = mapPrLabel(raw.label);
      return {
        ...base,
        kind: raw.__typename === "LabeledEvent" ? "labeled" : "unlabeled",
        ...(label ? { label } : {}),
      };
    }
    case "ReviewRequestedEvent":
    case "ReviewRequestRemovedEvent": {
      const reviewer = mapRequestedReviewer(raw.requestedReviewer);
      return {
        ...base,
        kind:
          raw.__typename === "ReviewRequestedEvent" ? "review-requested" : "review-request-removed",
        ...(reviewer ? { reviewer } : {}),
      };
    }
    case "HeadRefForcePushedEvent":
      return {
        ...base,
        kind: "force-pushed",
        ...refs(object(raw.beforeCommit).oid, object(raw.afterCommit).oid),
      };
    case "BaseRefChangedEvent":
      return { ...base, kind: "base-changed", ...refs(raw.previousRefName, raw.currentRefName) };
    case "RenamedTitleEvent":
      // Titles ride in fromRef/toRef: the contract has no title fields.
      return { ...base, kind: "renamed", ...refs(raw.previousTitle, raw.currentTitle) };
    default:
      return undefined;
  }
}

/**
 * GitHub records a merge as a MergedEvent plus a ClosedEvent at the same time;
 * a merged review cannot reopen, so any close at or after the merge is that
 * duplicate. `opened` has no event and comes from the review's own timestamp.
 */
function mapTimeline(
  raw: unknown,
  opened: { createdAt?: string | undefined; author?: PrAuthor | undefined },
): PrTimelineEvent[] {
  const events = rows(raw)
    .map(mapTimelineEvent)
    .filter((event): event is PrTimelineEvent => event !== undefined);
  const mergedAt = events.find((event) => event.kind === "merged")?.createdAt;
  return [
    ...lifecycleEvents(opened),
    ...events.filter(
      (event) => !(mergedAt && event.kind === "closed" && event.createdAt >= mergedAt),
    ),
  ];
}

/**
 * Applies a {@link PR_METADATA_QUERY} response to mapped details. An
 * unreadable response leaves the optional fields absent.
 */
export function withPrMetadata(details: PrDetails, output: string | undefined): PrDetails {
  if (!output) return details;
  let pr: Raw;
  try {
    pr = object(object(object(object(JSON.parse(output)).data).repository).pullRequest);
  } catch {
    return details;
  }
  if (!Array.isArray(pr.reactionGroups) || !object(pr.timelineItems).nodes) return details;
  const commentReactions = new Map(
    rows(object(pr.comments).nodes).flatMap((node) => {
      const id = str(node.id) || undefined;
      return id ? [[id, mapReactions(node.reactionGroups)] as const] : [];
    }),
  );
  const comments = details.comments.map((comment): PrComment => {
    const reactions = commentReactions.get(comment.id);
    return reactions ? { ...comment, reactions } : comment;
  });
  return {
    ...details,
    comments,
    reactions: mapReactions(pr.reactionGroups),
    timeline: mapTimeline(object(pr.timelineItems).nodes, {
      createdAt: details.createdAt,
      author: details.author,
    }),
  };
}
