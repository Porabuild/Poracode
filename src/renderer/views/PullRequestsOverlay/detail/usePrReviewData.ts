import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import type { PrDetails, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { isRemoteTransportFailure } from "@/shared/remote/clientErrors";
import {
  browserReviewBundleSchema,
  browserReviewOwner,
  readBrowserReviewCache,
  useBrowserReviewOnline,
  writeBrowserReviewCache,
} from "@/renderer/browser/offlineReviewCache";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  reviewCacheMatchesSource,
  reviewClient,
  reviewSourceIdentity,
} from "@/renderer/utils/forgeReviews";

/**
 * Loads one review (details, review threads, files, diff) into the git store,
 * falling back to the browser's offline snapshot when the host is unreachable.
 * A load is discarded when the selected review, its source, or its head moved
 * while it was in flight.
 */
export function usePrReviewData(input: {
  projectId: string;
  prKey: string;
  prNumber: number;
  location: ProjectLocation;
  /** False while no review is selected: nothing loads and nothing is cleared. */
  enabled: boolean;
}) {
  const { projectId, prKey, prNumber, location, enabled } = input;
  const cacheKey = `${projectId}#${prNumber}`;
  const browserOnline = useBrowserReviewOnline();
  const source = useGitStore((s) => s.prData[prKey]?.source);
  const sourceIdentity = reviewSourceIdentity(source);
  const currentPrNumber = useGitStore((s) => s.prData[prKey]?.number);
  const headSha = useGitStore((s) => s.prData[prKey]?.headSha);
  const detailsSource = useGitStore((s) => s.prDetails[cacheKey]?.source);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [loadedHead, setLoadedHead] = useState<string | null | undefined>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generation = useRef(0);
  // The review on screen now. A reload captured for a previous review (a write that
  // finished after the selection moved) must not invalidate the current review's load.
  const selected = useRef({ cacheKey, enabled });
  useEffect(() => {
    selected.current = { cacheKey, enabled };
  }, [cacheKey, enabled]);

  async function load() {
    const hasCurrentSource = () => {
      const current = useGitStore.getState().prData[prKey];
      return (
        current !== null &&
        (!current || current.number === prNumber) &&
        reviewSourceIdentity(current?.source) === sourceIdentity &&
        current?.headSha === headSha
      );
    };
    if (!enabled || selected.current.cacheKey !== cacheKey || !hasCurrentSource()) return;
    const run = ++generation.current;
    const isCurrent = () => run === generation.current && hasCurrentSource();
    const owner = browserReviewOwner();
    const offlineKey = owner?.canRead
      ? JSON.stringify([
          owner.key,
          "review",
          projectId,
          location,
          prNumber,
          sourceIdentity,
          headSha ?? null,
        ])
      : undefined;
    setLoadedHead(null);
    setLoadError(null);
    setLoading(true);
    const client = reviewClient(source);
    try {
      await Promise.all([
        client.files({ projectLocation: location, prNumber }).then((res) => {
          if (isCurrent()) useGitStore.getState().setPrFiles(cacheKey, res.files);
        }),
        client.diff({ projectLocation: location, prNumber }).then((res) => {
          if (isCurrent()) useGitStore.getState().setPrDiff(cacheKey, res.diff);
        }),
        client.details({ projectLocation: location, prNumber }).then(async (res) => {
          if (!isCurrent()) return;
          useGitStore.getState().setPrDetails(cacheKey, res.details);
          if (res.pr) useGitStore.getState().setPrData(prKey, res.pr);
          const resolvedSource = res.details.source ?? res.pr?.source ?? source;
          if (resolvedSource && !resolvedSource.capabilities.reviewThreads) return;
          const { threads } = await reviewClient(resolvedSource).threads({
            projectLocation: location,
            prNumber,
          });
          if (!isCurrent()) return;
          // Single unresolved, unanchored comments stay in the conversation;
          // everything else is a thread.
          const conversations = threads.filter(
            (thread) => thread.path || thread.comments.length > 1 || thread.isResolved,
          );
          const threaded = new Set(
            conversations.flatMap((thread) => thread.comments.map((comment) => comment.id)),
          );
          useGitStore.getState().setPrDetails(cacheKey, {
            ...res.details,
            comments: res.details.comments.filter((comment) => !threaded.has(comment.id)),
            reviewThreads: conversations,
          });
        }),
      ]);
      if (!isCurrent()) return;
      setLoadedHead(headSha);
      setCached(false);
      if (offlineKey && browserReviewOwner()?.key === owner?.key) {
        const state = useGitStore.getState();
        const bundle = browserReviewBundleSchema.safeParse({
          pr: state.prData[prKey] ?? undefined,
          details: state.prDetails[cacheKey],
          files: state.prFiles[cacheKey],
          diff: state.prDiffs[cacheKey],
        });
        if (bundle.success) void writeBrowserReviewCache(offlineKey, bundle.data);
      }
    } catch (error) {
      if (offlineKey && isRemoteTransportFailure(error)) {
        const snapshot = await readBrowserReviewCache(offlineKey, browserReviewBundleSchema);
        if (
          snapshot &&
          snapshot.details.number === prNumber &&
          reviewCacheMatchesSource(source, snapshot.details.source) &&
          (!snapshot.pr ||
            (snapshot.pr.number === prNumber &&
              snapshot.pr.headSha === headSha &&
              reviewCacheMatchesSource(source, snapshot.pr.source))) &&
          isCurrent() &&
          browserReviewOwner()?.key === owner?.key
        ) {
          useGitStore.getState().setPrFiles(cacheKey, snapshot.files);
          useGitStore.getState().setPrDiff(cacheKey, snapshot.diff);
          // JSON plus the canonical result schema cannot contain explicit undefined properties.
          useGitStore.getState().setPrDetails(cacheKey, snapshot.details as PrDetails);
          setLoadedHead(headSha);
          setCached(true);
          return;
        }
      }
      if (isCurrent()) {
        toast.danger(friendlyError(error));
        setLoadError(friendlyError(error));
      }
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    const state = useGitStore.getState();
    if (
      state.prData[prKey] === null ||
      reviewSourceIdentity(state.prDetails[cacheKey]?.source) !== sourceIdentity
    )
      state.clearPrCache(cacheKey);
    setLoading(false);
    setCached(false);
    setLoadedHead(null);
  }, [enabled, cacheKey, prKey, sourceIdentity, currentPrNumber]);

  useEffect(() => {
    // Always refetch on open so a stale cache never hides new comments, commits or checks.
    void load();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This counter invalidates async loads; it is not a DOM ref.
      generation.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the review, its source, or its head changes
  }, [enabled, cacheKey, prKey, sourceIdentity, currentPrNumber, headSha, browserOnline]);

  const cacheMatchesSource = reviewCacheMatchesSource(source, detailsSource);
  const contentReady = !loading && loadedHead === headSha && currentPrNumber === prNumber;
  return {
    cacheKey,
    /** Draft-review key: source-qualified so the same PR number on another host
     *  or account does not share (or delete) drafts. */
    draftKey: sourceIdentity ? `${cacheKey}@${sourceIdentity}` : cacheKey,
    source,
    sourceIdentity,
    headSha,
    loading,
    cached,
    cacheMatchesSource,
    contentReady,
    /** Writes need a live, current, non-cached review. */
    reviewReady: contentReady && browserOnline && !cached,
    browserOnline,
    /** Set when the last load failed with a non-transport error the UI can retry. */
    loadError,
    reload: () => void load(),
  };
}
