import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { PrComment } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useGitStore } from "@/renderer/state/gitStore";
import { reviewClient, reviewSourceIdentity } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import type { SavePrComment } from "../parts/PrCommentBody";

/**
 * Whether the review on screen is still the one an async write started on:
 * the same number and the same source, so a slow save never lands on another review.
 */
export function useIsCurrentReview() {
  const scope = usePrDetailScope();
  const identity = reviewSourceIdentity(scope.source);
  return () => {
    const current = useGitStore.getState().prData[scope.prKey];
    return (
      current !== null &&
      (current === undefined || current.number === scope.prNumber) &&
      reviewSourceIdentity(current?.source ?? scope.source) === identity
    );
  };
}

/**
 * Returns the save handler for a comment the viewer may edit, or `undefined`
 * when the host cannot edit this kind of comment or someone else wrote it.
 */
export function useCommentEditor() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const isCurrent = useIsCurrentReview();

  return (comment: PrComment, threadId?: string): SavePrComment | undefined => {
    const source = scope.scoped;
    const kind = threadId ? "inline" : "conversation";
    if (
      !source ||
      !source.capabilities.commentEditing?.includes(kind) ||
      comment.author.login.toLowerCase() !== source.account.login.toLowerCase()
    ) {
      return undefined;
    }
    return async (body, expectedBody) => {
      if (scope.readOnly || scope.loading || !isCurrent()) return false;
      try {
        await reviewClient(source).editComment({
          projectLocation: scope.location,
          prNumber: scope.prNumber,
          commentId: comment.id,
          body,
          expectedBody,
          forgeAccount: source.account,
          forgeRepository: source.repository,
          ...(threadId ? { threadId } : {}),
        });
        if (!isCurrent()) return false;
        toast.success(t`Comment updated`);
        scope.reload();
        return true;
      } catch (error) {
        if (isCurrent()) toast.danger(friendlyError(error));
        return false;
      }
    };
  };
}
