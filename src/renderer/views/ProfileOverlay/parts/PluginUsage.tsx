import { Bot, Plug, Sparkles, Wrench } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileSkillUsage } from "@/shared/contracts";

function iconFor(kind: ProfileSkillUsage["kind"]) {
  if (kind === "subagent") return Bot;
  if (kind === "mcp") return Plug;
  if (kind === "tool") return Wrench;
  return Sparkles;
}

export function PluginUsage(props: {
  items: ProfileSkillUsage[];
  title?: string;
  emptyText?: string;
}) {
  const { t } = useLingui();
  const { items, title, emptyText } = props;
  const heading = title ?? t`Most used plugins`;
  const empty = emptyText ?? t`Nothing tracked yet. It'll appear here as you use it.`;

  return (
    <section className="flex flex-col gap-1">
      <h2 className="mb-1 text-sm font-semibold text-foreground">{heading}</h2>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted">{empty}</p>
      ) : (
        <div className="divide-y divide-separator">
          {items.map((item) => {
            const Icon = iconFor(item.kind);
            return (
              <div
                key={`${item.kind}:${item.name}`}
                className="flex items-center justify-between gap-4 py-2 text-sm"
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
    </section>
  );
}
