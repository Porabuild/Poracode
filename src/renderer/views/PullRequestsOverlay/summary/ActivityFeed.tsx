import { useState } from "react";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronDown } from "lucide-react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useGitStore } from "@/renderer/state/gitStore";
import { reviewSourceIdentity } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrResponsiveMenu } from "../parts/PrResponsiveMenu";
import {
  buildActivity,
  filterActivity,
  type ActivityFilter,
  type ActivityOrder,
} from "./activityModel";
import { CommentRow, ReviewRow, ReviewThreadRow } from "./ActivityRows";
import { useCommentEditor } from "./useCommentEditor";

function ActivityFilterMenu(props: {
  value: ActivityFilter;
  onChange: (value: ActivityFilter) => void;
}) {
  const { t } = useLingui();
  const options: { id: ActivityFilter; label: string }[] = [
    { id: "all", label: t`All activity` },
    { id: "comments", label: t`Comments` },
    { id: "reviews", label: t`Reviews` },
  ];
  const current = options.find((option) => option.id === props.value) ?? options[0]!;
  return (
    <PrResponsiveMenu
      label={t`Filter activity`}
      sections={[
        {
          id: "filter",
          items: options.map((option) => ({
            id: option.id,
            label: option.label,
            checked: option.id === props.value,
            onSelect: () => props.onChange(option.id),
          })),
        },
      ]}
      trigger={
        <Button
          size="sm"
          variant="ghost"
          aria-label={t`Filter activity`}
          className="h-6 min-h-0 gap-1 px-2 text-[11px] font-medium text-muted hover:text-foreground"
        >
          {current.label}
          <ChevronDown className="size-3" />
        </Button>
      }
    />
  );
}

/** Comments, review summaries and review threads, filtered and ordered locally. */
export function ActivityFeed() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [order, setOrder] = useState<ActivityOrder>("oldest");
  const commentEditor = useCommentEditor();
  const entries = filterActivity(buildActivity(details), filter, order);
  const sourceIdentity = reviewSourceIdentity(details?.source);
  const disabled = scope.loading || scope.readOnly;
  const OrderIcon = order === "oldest" ? ArrowDownNarrowWide : ArrowUpNarrowWide;

  return (
    <section aria-label={t`Activity`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          <Trans>Activity</Trans>
        </h3>
        <div className="flex items-center gap-1">
          <ActivityFilterMenu value={filter} onChange={setFilter} />
          <Button
            size="sm"
            variant="ghost"
            aria-label={order === "oldest" ? t`Oldest first` : t`Newest first`}
            className="h-6 min-h-0 gap-1 px-2 text-[11px] font-medium text-muted hover:text-foreground"
            onPress={() => setOrder(order === "oldest" ? "newest" : "oldest")}
          >
            <OrderIcon className="size-3" />
            {order === "oldest" ? <Trans>Oldest first</Trans> : <Trans>Newest first</Trans>}
          </Button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted/60">
          {filter === "all" ? (
            <Trans>No conversation yet. Be the first to comment.</Trans>
          ) : (
            <Trans>Nothing matches this filter.</Trans>
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            if (entry.kind === "comment") {
              return (
                <CommentRow
                  key={`${sourceIdentity}:c-${entry.data.id}`}
                  comment={entry.data}
                  disabled={disabled}
                  onSave={commentEditor(entry.data)}
                />
              );
            }
            return entry.kind === "review" ? (
              <ReviewRow key={`r-${entry.data.id}`} review={entry.data} />
            ) : (
              <ReviewThreadRow
                key={`${sourceIdentity}:t-${entry.data.id}`}
                thread={entry.data}
                disabled={disabled}
                commentEditor={commentEditor}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
