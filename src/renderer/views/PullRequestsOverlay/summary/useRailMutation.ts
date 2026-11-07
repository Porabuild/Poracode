import { useState } from "react";
import { toast } from "@heroui/react";
import { friendlyError } from "@/shared/messages";
import { scopedReviewClient } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";

type ScopedClient = ReturnType<typeof scopedReviewClient>;

/**
 * Runs one account-scoped write for the side rail (reviewers, labels). It is
 * refused while the review is read-only or another write is in flight, shows the
 * host's error as a toast, and reloads the review after a success.
 */
export function useRailMutation() {
  const scope = usePrDetailScope();
  const [pending, setPending] = useState(false);
  const { scoped } = scope;

  async function run(call: (client: ScopedClient) => Promise<unknown>): Promise<boolean> {
    if (!scoped || scope.readOnly || pending) return false;
    setPending(true);
    try {
      await call(scopedReviewClient(scoped));
      scope.reload();
      return true;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, run };
}
