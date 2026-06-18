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

export function ActivityInsights(props: { core: ProfileCoreStats }) {
  const { t } = useLingui();
  const { insights, totals } = props.core;

  const reasoning = insights.topReasoning
    ? `${insights.topReasoning.label} - ${insights.topReasoning.percent}%`
    : "-";
  const provider = insights.topProvider
    ? `${insights.topProvider.label} - ${insights.topProvider.percent}%`
    : "-";
  const activeHour = insights.mostActiveHour ? insights.mostActiveHour.label : "-";

  return (
    <section className="flex flex-col gap-1">
      <h2 className="mb-1 text-sm font-semibold text-foreground">{t`Activity insights`}</h2>
      <div className="divide-y divide-separator">
        <Row label={t`Most used provider`} value={provider} />
        <Row label={t`Most used reasoning`} value={reasoning} />
        <Row label={t`Fast mode`} value={`${insights.fastModePercent}%`} />
        <Row label={t`Most active hour`} value={activeHour} />
        <Row label={t`Messages sent`} value={totals.messagesSent.toLocaleString()} />
        <Row label={t`Goals set`} value={totals.goalsSet.toLocaleString()} />
        <Row label={t`Skills/subagents explored`} value={String(insights.skillsExplored)} />
        <Row label={t`Skill/subagent runs`} value={insights.totalSkillsUsed.toLocaleString()} />
        <Row label={t`Total threads`} value={totals.totalThreads.toLocaleString()} />
        <Row label={t`Total prompts`} value={totals.totalPrompts.toLocaleString()} />
      </div>
    </section>
  );
}
