import type { PrComment, PrDetails, PrReaction } from "@/shared/contracts";

/** The reaction list after the viewer sets `content` to `reacted`; unchanged when it already is. */
export function withReaction(
  reactions: readonly PrReaction[] | undefined,
  content: string,
  reacted: boolean,
): PrReaction[] {
  const current = reactions ?? [];
  const existing = current.find((reaction) => reaction.content === content);
  if (reacted) {
    if (!existing) return [...current, { content, count: 1, viewerReacted: true }];
    if (existing.viewerReacted) return [...current];
    return current.map((reaction) =>
      reaction.content === content
        ? { ...reaction, count: reaction.count + 1, viewerReacted: true }
        : reaction,
    );
  }
  if (!existing?.viewerReacted) return [...current];
  return current.flatMap((reaction) => {
    if (reaction.content !== content) return [reaction];
    const count = reaction.count - 1;
    return count > 0 ? [{ ...reaction, count, viewerReacted: false }] : [];
  });
}

function mapComment(
  comment: PrComment,
  subjectId: string,
  change: (reactions: readonly PrReaction[] | undefined) => PrReaction[],
): PrComment {
  return comment.id === subjectId ? { ...comment, reactions: change(comment.reactions) } : comment;
}

/**
 * The details with one subject's reactions changed: the review description when
 * `subjectId` is absent, otherwise the conversation or inline comment with that id.
 */
export function withSubjectReactions(
  details: PrDetails,
  subjectId: string | undefined,
  change: (reactions: readonly PrReaction[] | undefined) => PrReaction[],
): PrDetails {
  if (subjectId === undefined) return { ...details, reactions: change(details.reactions) };
  return {
    ...details,
    comments: details.comments.map((comment) => mapComment(comment, subjectId, change)),
    ...(details.reviewThreads
      ? {
          reviewThreads: details.reviewThreads.map((thread) => ({
            ...thread,
            comments: thread.comments.map((comment) => mapComment(comment, subjectId, change)),
          })),
        }
      : {}),
  };
}

/** The reactions currently stored for one subject: the description, or the comment with `subjectId`. */
export function subjectReactionsOf(
  details: PrDetails,
  subjectId: string | undefined,
): readonly PrReaction[] | undefined {
  if (subjectId === undefined) return details.reactions;
  const comments = [
    ...details.comments,
    ...(details.reviewThreads?.flatMap((thread) => thread.comments) ?? []),
  ];
  return comments.find((comment) => comment.id === subjectId)?.reactions;
}

export function sameReactions(
  a: readonly PrReaction[] | undefined,
  b: readonly PrReaction[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every((reaction, index) => {
      const other = right[index];
      return (
        other?.content === reaction.content &&
        other.count === reaction.count &&
        other.viewerReacted === reaction.viewerReacted
      );
    })
  );
}

/**
 * Undoes a refused toggle. When the list still is exactly what the optimistic write
 * produced, the snapshot taken before it is restored verbatim (counts and order).
 * When a reload replaced the list meanwhile, only the viewer's own state for
 * `content` is put back, so counts the host reported are kept.
 */
export function rollbackReaction(input: {
  current: readonly PrReaction[] | undefined;
  before: readonly PrReaction[] | undefined;
  optimistic: readonly PrReaction[];
  content: string;
}): PrReaction[] {
  const { current, before, optimistic, content } = input;
  if (sameReactions(current, optimistic)) return [...(before ?? [])];
  const wasReacted = before?.some((r) => r.content === content && r.viewerReacted) ?? false;
  return withReaction(current, content, wasReacted);
}
