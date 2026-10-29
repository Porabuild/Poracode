import { useEffect, useEffectEvent, useState } from "react";
import { Button, Input, TextField, toast } from "@heroui/react";
import { Plus } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrReviewer } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { PixelLoader } from "@/renderer/components/common";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { scopedReviewClient } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrAvatar } from "../parts/PrAvatar";

const SEARCH_DEBOUNCE_MS = 250;

interface Candidates {
  query: string;
  reviewers: PrReviewer[];
  truncated: boolean;
}

/**
 * Candidates for the typed query, fetched after a short pause (immediately for
 * the empty query) while the picker is open. A slower, older answer is dropped.
 */
function useReviewerCandidates(open: boolean, query: string) {
  const scope = usePrDetailScope();
  const [result, setResult] = useState<Candidates | null>(null);
  const fetchCandidates = useEffectEvent((search: string, isStale: () => boolean) => {
    if (!scope.scoped) return;
    scopedReviewClient(scope.scoped)
      .reviewerCandidates({
        projectLocation: scope.location,
        prNumber: scope.prNumber,
        ...(search ? { query: search } : {}),
      })
      .then((found) => {
        if (isStale()) return;
        setResult({
          query: search,
          truncated: found.truncated,
          reviewers: found.reviewers.map((reviewer) => ({
            id: reviewer.id,
            login: reviewer.login,
            ...(reviewer.name ? { name: reviewer.name } : {}),
            ...(reviewer.avatarUrl ? { avatarUrl: reviewer.avatarUrl } : {}),
            ...(reviewer.team ? { team: true } : {}),
          })),
        });
      })
      .catch((error: unknown) => {
        if (isStale()) return;
        setResult({ query: search, reviewers: [], truncated: false });
        toast.danger(friendlyError(error));
      });
  });

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const timer = setTimeout(
      () => fetchCandidates(query, () => stale),
      query ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  return { result, loading: open && result?.query !== query };
}

/** A search popover that requests a review from the chosen person or group. */
export function ReviewerPicker(props: {
  /** Reviewers already requested; they are not offered again. */
  requested: readonly PrReviewer[];
  authorLogin: string | undefined;
  disabled: boolean;
  onPick: (reviewer: PrReviewer) => Promise<boolean>;
}) {
  const { requested, authorLogin, disabled, onPick } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { result, loading } = useReviewerCandidates(open, query);
  const offered = (result?.reviewers ?? []).filter(
    (candidate) =>
      !requested.some((reviewer) => reviewer.id === candidate.id) &&
      candidate.login.toLowerCase() !== authorLogin?.toLowerCase(),
  );

  return (
    <ResponsiveMenuSurface
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      label={t`Request a reviewer`}
      placement="bottom end"
      contentClassName="w-64 max-w-[calc(100vw-2rem)]"
      dialogClassName="p-2"
      trigger={
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t`Request a reviewer`}
          isDisabled={disabled}
          className="size-6 min-h-0 min-w-0 text-muted hover:text-foreground"
          onPress={() => {
            if (mobile) setOpen(true);
          }}
        >
          <Plus className="size-3.5" />
        </Button>
      }
    >
      <div className={mobile ? "px-3 pb-3" : ""}>
        <TextField aria-label={t`Search people`} value={query} onChange={setQuery}>
          <Input placeholder={t`Search people…`} className={mobile ? "text-base" : "text-xs"} />
        </TextField>
        <div className={`mt-2 overflow-y-auto ${mobile ? "max-h-[45dvh]" : "max-h-60"}`}>
          {loading && !result ? (
            <div className="flex justify-center py-3">
              <PixelLoader size="xs" />
            </div>
          ) : offered.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted">
              <Trans>No matching reviewers.</Trans>
            </p>
          ) : (
            <ul aria-label={t`Reviewer candidates`} className="flex flex-col">
              {offered.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left hover:bg-default-100 disabled:cursor-default disabled:opacity-60 ${
                      mobile ? "min-h-11 text-sm" : "py-1.5 text-xs"
                    }`}
                    disabled={disabled}
                    onClick={() => {
                      void onPick(candidate).then((added) => {
                        if (added) setOpen(false);
                      });
                    }}
                  >
                    <PrAvatar
                      author={{
                        login: candidate.login,
                        ...(candidate.avatarUrl ? { avatarUrl: candidate.avatarUrl } : {}),
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{candidate.login}</span>
                      {candidate.name ? (
                        <span className="block truncate text-[11px] text-muted">
                          {candidate.name}
                        </span>
                      ) : null}
                    </span>
                    {candidate.team ? (
                      <span className="shrink-0 text-[10px] uppercase text-muted">
                        <Trans>Team</Trans>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {result?.truncated ? (
            <p className="px-2 pt-1 text-[11px] text-muted">
              <Trans>More people match. Refine your search.</Trans>
            </p>
          ) : null}
        </div>
        {mobile ? (
          <Button
            variant="primary"
            className="mt-3 w-full"
            onPress={() => {
              setOpen(false);
              setQuery("");
            }}
          >
            <Trans>Done</Trans>
          </Button>
        ) : null}
      </div>
    </ResponsiveMenuSurface>
  );
}
