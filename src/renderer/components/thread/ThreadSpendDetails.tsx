import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { ThreadTokenUsage } from "@/shared/contracts/threadTokenUsage";
import type { ThreadCrewBinding } from "@/shared/crew";
import { readBridge } from "@/renderer/bridge";
import { resolveModelLabel } from "@/renderer/components/providers/modelDisplay";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

/**
 * Per-member token spend for a thread (lead, crew roles, other helpers) with a
 * list-price dollar estimate. Refetches whenever `refreshKey` changes, which
 * the usage dock ties to context occupancy so it follows the running turn.
 */
export function ThreadSpendDetails({
  threadId,
  crewBinding,
  refreshKey,
}: {
  threadId: string;
  crewBinding?: ThreadCrewBinding | undefined;
  refreshKey: number;
}) {
  const { t } = useLingui();
  const [usage, setUsage] = useState<ThreadTokenUsage | null>(null);
  const statuses = useAgentStatusesStore(
    useShallow((state) => [...state.agentStatuses, ...state.wslAgentStatuses]),
  );
  useEffect(() => {
    let cancelled = false;
    // Coalesce bursts of context updates while a turn streams; with no
    // reported context yet there is nothing to coalesce, so read at once.
    const delay = refreshKey > 0 ? 300 : 0;
    const timer = setTimeout(() => {
      Promise.resolve(readBridge().dbGetThreadTokenUsage(threadId)).then(
        (next) => {
          if (!cancelled) setUsage(next);
        },
        () => {
          if (!cancelled) setUsage(null);
        },
      );
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [threadId, refreshKey]);

  if (!usage || usage.members.length === 0) return null;
  const memberLabel = (member: string) => {
    if (member === "lead") return t`Lead`;
    if (member === "helper") return t`Other agents`;
    const roleId = member.slice("role:".length);
    return crewBinding?.roles.find((role) => role.id === roleId)?.label ?? roleId;
  };
  const rows = usage.members.map((row) => ({
    key: `${row.member}:${row.provider}:${row.model ?? ""}`,
    label: memberLabel(row.member),
    model:
      resolveModelLabel(
        statuses.find((status) => status.kind === row.provider),
        row.model,
      ) ?? row.provider,
    row,
  }));
  const totalUsd = usage.members.reduce((sum, row) => sum + row.costUsd, 0);
  const unpriced = usage.members.some((row) => row.pricedTotal < row.total);

  return (
    <div className="flex flex-col gap-1.5 border-t border-divider px-3 pt-2 pb-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">
          <Trans>Spend</Trans>
        </span>
        <span className="tabular-nums text-foreground">{formatUsd(totalUsd)}</span>
      </div>
      <ul className="grid gap-1">
        {rows.map(({ key, label, model, row }) => (
          <li key={key} className="flex flex-col gap-0.5 rounded px-1 py-0.5 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate text-foreground">
                {label} · {model}
              </span>
              <span className="shrink-0 tabular-nums text-foreground-muted">
                {formatUsd(row.costUsd)}
              </span>
            </div>
            <span className="truncate tabular-nums text-foreground-muted">
              {t`${compactNumber.format(row.total)} tokens · cached ${compactNumber.format(row.tokens.cacheRead)} · written ${compactNumber.format(row.tokens.cacheWrite)} · output ${compactNumber.format(row.tokens.output)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground-muted">
        {unpriced ? (
          <Trans>Estimated at list prices. Some usage has no known price.</Trans>
        ) : (
          <Trans>Estimated at list prices.</Trans>
        )}
      </p>
    </div>
  );
}
