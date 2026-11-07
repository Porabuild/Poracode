import { useEffect, useEffectEvent, useRef, useState } from "react";
import { friendlyError } from "@/shared/messages";
import { scopedReviewClient } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";

export type CommitDiffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; diff: string };

/**
 * The diff of one commit of the review. Idle without a commit or when the host
 * cannot serve commit diffs. Results are cached per review, head and commit; a
 * response that arrives after the commit or head changed is dropped.
 */
export function useCommitDiff(commit: string | null): {
  state: CommitDiffState;
  retry: () => void;
} {
  const scope = usePrDetailScope();
  const { scoped, location, prNumber, cacheKey, headSha } = scope;
  const enabled = commit !== null && scoped?.capabilities.commitDiffs === true;
  const key = enabled ? `${cacheKey}:${headSha ?? ""}:${commit}` : null;
  const [cache, setCache] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const generation = useRef(0);
  const cached = key === null ? undefined : cache[key];

  const load = useEffectEvent((requestKey: string, requestCommit: string, ticket: number) => {
    if (!scoped) return;
    scopedReviewClient(scoped)
      .commitDiff({ projectLocation: location, prNumber, commit: requestCommit })
      .then(({ diff }) => {
        if (generation.current === ticket) {
          setCache((current) => ({ ...current, [requestKey]: diff }));
        }
      })
      .catch((error: unknown) => {
        if (generation.current === ticket) {
          setFailure({ key: requestKey, message: friendlyError(error) });
        }
      });
  });
  useEffect(() => {
    if (key === null || commit === null || cached !== undefined || failure?.key === key) return;
    load(key, commit, ++generation.current);
    return () => {
      generation.current += 1;
    };
  }, [key, commit, cached, failure]);

  function retry() {
    setFailure(null);
  }

  if (key === null) return { state: { status: "idle" }, retry };
  if (cached !== undefined) return { state: { status: "ready", diff: cached }, retry };
  if (failure?.key === key) return { state: { status: "error", message: failure.message }, retry };
  return { state: { status: "loading" }, retry };
}
