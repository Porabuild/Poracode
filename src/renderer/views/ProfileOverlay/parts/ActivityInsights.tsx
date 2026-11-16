import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileCoreStats } from "@/shared/contracts";

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted">{props.label}</span>
      <span className="font-medium tabular-nums text-foreground">{props.value}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <Skeleton className="h-4 w-32 rounded bg-foreground/10" />
      <Skeleton className="h-4 w-14 rounded bg-foreground/10" />
    </div>
  );
}

export function ActivityInsights(props: {
  core: ProfileCoreStats | null;
  loading?: boolean;
  className?: string;
  skillsAvailable?: boolean;
}) {
  const { t } = useLingui();
  const { core, loading = false, className = "" } = props;

  if (loading || !core) {
    return (
      <section className={`flex flex-col gap-1 ${className}`}>
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t`Activity insights`}</h2>
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          <div className="divide-y divide-separator">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
          <div className="divide-y divide-separator">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const { insights, totals } = core;
  const reasoning = insights.topReasoning
    ? `${insights.topReasoning.label} - ${insights.topReasoning.percent}%`
    : "-";
  const provider = insights.topProvider
    ? `${insights.topProvider.label} - ${insights.topProvider.percent}%`
    : "-";
  const activeHour = insights.mostActiveHour ? insights.mostActiveHour.label : "-";
  const rows = [
    { label: t`Most used provider`, value: provider },
    { label: t`Most used reasoning`, value: reasoning },
    { label: t`Fast mode`, value: `${insights.fastModePercent}%` },
    { label: t`Most active hour`, value: activeHour },
    { label: t`Messages sent`, value: totals.messagesSent.toLocaleString() },
    { label: t`Goals set`, value: totals.goalsSet.toLocaleString() },
    {
      label: t`Skills explored`,
      value: props.skillsAvailable === false ? "-" : String(insights.skillsExplored),
    },
    { label: t`Skill runs`, value: insights.totalSkillsUsed.toLocaleString() },
    { label: t`Workflow runs`, value: insights.workflowRuns.toLocaleString() },
    { label: t`Subagent runs`, value: insights.subagentRuns.toLocaleString() },
    { label: t`MCP tool calls`, value: insights.mcpToolCalls.toLocaleString() },
    { label: t`Total threads`, value: totals.totalThreads.toLocaleString() },
    { label: t`Total prompts`, value: totals.totalPrompts.toLocaleString() },
  ];
  const midpoint = Math.ceil(rows.length / 2);
  const groups = [
    { key: "primary", rows: rows.slice(0, midpoint) },
    { key: "secondary", rows: rows.slice(midpoint) },
  ];

  return (
    <section className={`flex flex-col gap-1 ${className}`}>
      <h2 className="mb-1 text-sm font-semibold text-foreground">{t`Activity insights`}</h2>
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.key} className="divide-y divide-separator">
            {group.rows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
