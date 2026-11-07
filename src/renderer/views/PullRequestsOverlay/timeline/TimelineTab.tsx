import { useState } from "react";
import { Button } from "@heroui/react";
import { ArrowDownUp, Funnel } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrLoadError } from "../parts/PrLoadError";
import { PrResponsiveMenu } from "../parts/PrResponsiveMenu";
import { usePrFlow } from "../detail/prFlow";
import { TimelineEntryRow } from "./TimelineEntryRow";
import {
  buildPrTimeline,
  filterPrTimeline,
  orderPrTimeline,
  type PrTimelineFilter,
  type PrTimelineOrder,
} from "./prTimelineModel";

function FilterMenu(props: {
  value: PrTimelineFilter;
  onChange: (value: PrTimelineFilter) => void;
}) {
  const { t } = useLingui();
  const options: { id: PrTimelineFilter; label: string }[] = [
    { id: "all", label: t`All` },
    { id: "events", label: t`Events` },
    { id: "commits", label: t`Commits` },
    { id: "reviews", label: t`Reviews & comments` },
  ];
  const current = options.find((option) => option.id === props.value);
  return (
    <PrResponsiveMenu
      label={t`Filter timeline`}
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
        <Button size="sm" variant="ghost" aria-label={t`Filter timeline`}>
          <Funnel className="size-3.5" />
          {current?.label}
        </Button>
      }
    />
  );
}

/** Everything that happened on the review, oldest first, on one rail. */
export function TimelineTab() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const { flow } = usePrFlow();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  const [filter, setFilter] = useState<PrTimelineFilter>("all");
  const [order, setOrder] = useState<PrTimelineOrder>("oldest");

  if (!scope.contentReady && !details) {
    if (scope.loadError) {
      return <PrLoadError message={scope.loadError} onRetry={scope.reload} />;
    }
    return (
      <div className={`flex items-center justify-center ${flow ? "min-h-48" : "h-full"}`}>
        <PixelLoader size="md" />
      </div>
    );
  }

  const all = buildPrTimeline(details);
  const entries = orderPrTimeline(filterPrTimeline(all, filter), order);

  return (
    <div className={flow ? "flex flex-col" : "flex h-full min-h-0 flex-col"}>
      <div
        className={`flex shrink-0 items-center justify-end gap-1 pb-2 ${
          flow ? "px-[var(--m-page-inline)]" : "px-6"
        }`}
      >
        <FilterMenu value={filter} onChange={setFilter} />
        <Button
          size="sm"
          variant="ghost"
          aria-label={t`Change order`}
          onPress={() => setOrder(order === "oldest" ? "newest" : "oldest")}
        >
          <ArrowDownUp className="size-3.5" />
          {order === "oldest" ? t`Oldest first` : t`Newest first`}
        </Button>
      </div>
      <div
        className={
          flow ? "px-[var(--m-page-inline)] pb-6" : "min-h-0 flex-1 overflow-y-auto px-6 pb-6"
        }
      >
        {all.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            <Trans>No activity yet.</Trans>
          </p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            <Trans>Nothing matches this filter.</Trans>
          </p>
        ) : (
          <div className="relative">
            <span
              aria-hidden
              className="absolute bottom-4 left-3 top-3 w-px bg-[color:var(--border)]"
            />
            <ul className="relative">
              {entries.map((entry) => (
                <TimelineEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
