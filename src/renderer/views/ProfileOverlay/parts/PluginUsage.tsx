import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { Skeleton } from "@heroui/react";
import { Bot, Plug, Sparkles, Wrench } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileSkillUsage } from "@/shared/contracts";

function iconFor(kind: ProfileSkillUsage["kind"]) {
  if (kind === "subagent") return Bot;
  if (kind === "mcp") return Plug;
  if (kind === "tool") return Wrench;
  return Sparkles;
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="flex items-center gap-2">
        <Skeleton className="size-3.5 rounded bg-foreground/10" />
        <Skeleton className="h-3.5 w-28 rounded bg-foreground/10" />
      </span>
      <Skeleton className="h-3.5 w-12 rounded bg-foreground/10" />
    </div>
  );
}

export function PluginUsage(props: {
  items: ProfileSkillUsage[];
  title?: string;
  emptyText?: string;
  loading?: boolean;
  loadingRows?: number;
}) {
  const { t } = useLingui();
  const { items, title, emptyText, loading = false, loadingRows = 4 } = props;
  const heading = title ?? t`Most used plugins`;
  const empty = emptyText ?? t`Nothing tracked yet. It'll appear here as you use it.`;

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
      <ContentSurface className="flex-1 px-4 py-1">
        {loading && items.length === 0 ? (
          <div className="divide-y divide-[var(--hairline-soft)]">
            {Array.from({ length: loadingRows }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-3 text-xs text-muted">{empty}</p>
        ) : (
          <div className="divide-y divide-[var(--hairline-soft)]">
            {items.map((item) => {
              const Icon = iconFor(item.kind);
              return (
                <div
                  key={`${item.kind}:${item.name}`}
                  className="flex items-center justify-between gap-4 py-2.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate font-medium text-foreground">{item.displayName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {item.runCount === 1
                      ? t`${item.runCount.toLocaleString()} run`
                      : t`${item.runCount.toLocaleString()} runs`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ContentSurface>
    </section>
  );
}
