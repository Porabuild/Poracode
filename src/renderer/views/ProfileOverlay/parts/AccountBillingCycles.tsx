import { useState } from "react";
import { Tooltip } from "@heroui/react";
import { Info } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { Button } from "@/renderer/components/common";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useHostUsageView } from "@/renderer/components/providers/HostUsageView";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { UsageCreditsRow } from "@/renderer/components/providers/UsageProviderCardView";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { useProviderUsageHydration } from "@/renderer/components/providers/useProviderUsageHydration";
import {
  formatMoney,
  formatTokens,
  hasDisplayableCredits,
  sharedWindowResetLabel,
} from "@/renderer/components/providers/usageFormat";
import {
  resolveHostUsageProviders,
  usageProviderIdForAgent,
  usageProvidersForAgentInstances,
} from "@/renderer/components/providers/usageProviders";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  fromRemoteProfileDeviceId,
  type ProfileSelection,
} from "@/renderer/views/ProfileOverlay/useProfileData";

function isBillingSnapshot(snapshot: UsageSnapshot): boolean {
  if (snapshot.status !== "ok") return false;
  const hasMoneyOrBreakdownWindow = snapshot.windows.some(
    (w) =>
      (w.used !== undefined && (w.unit === "usd" || Boolean(w.currency))) ||
      Boolean(w.breakdown && w.breakdown.length > 0),
  );
  const hasReportedCost = Boolean(snapshot.cost && !snapshot.cost.estimated);
  const hasCredits = hasDisplayableCredits(snapshot.credits, snapshot.windows);
  const hasTokens = Boolean(snapshot.tokens?.total && snapshot.tokens.total > 0);
  return hasMoneyOrBreakdownWindow || hasReportedCost || hasCredits || hasTokens;
}

/**
 * Connected accounts' current billing-cycle usage, quotas, and cycle token
 * totals reported by providers (hover/tap any bar with breakdown data for
 * per-model or pool details). Kept strictly separate from Poracode's local
 * ledger totals so cross-client / account-wide figures never double-count.
 */
export function AccountBillingCycles(props: {
  snapshots: readonly UsageSnapshot[];
  providerLabels?: Readonly<Record<string, string>>;
}) {
  const { t } = useLingui();
  const [now] = useState(() => Date.now());
  const [infoOpen, setInfoOpen] = useState(false);
  const billingSnapshots = props.snapshots
    .filter(isBillingSnapshot)
    .toSorted((a, b) => a.providerId.localeCompare(b.providerId));

  if (billingSnapshots.length === 0) return null;

  return (
    <section
      className="flex min-w-0 flex-col gap-3 border-t border-[var(--hairline-soft)] pt-6"
      aria-label={t`Account billing cycles`}
      data-testid="profile-account-billing-cycles"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">
            <Trans>Account billing cycles</Trans>
          </h2>
          <Tooltip
            delay={250}
            isOpen={infoOpen}
            onOpenChange={setInfoOpen}
            shouldCloseOnPress={false}
          >
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`About account billing cycles`}
              aria-expanded={infoOpen}
              className="size-6 min-h-6 min-w-6 text-muted"
              onPress={() => setInfoOpen((prev) => !prev)}
            >
              <Info className="size-3.5" aria-hidden="true" />
            </Button>
            <Tooltip.Content
              placement="top"
              className="max-w-72 space-y-1.5 text-xs leading-relaxed"
            >
              <p>
                <Trans>
                  Live usage reported by connected provider accounts for their active billing cycle.
                  Includes activity outside Poracode and is kept separate from ledger totals above.
                </Trans>
              </p>
            </Tooltip.Content>
          </Tooltip>
        </div>
        <p className="text-xs text-muted">
          <Trans>Account-wide · current cycle</Trans>
        </p>
      </div>

      <div className="grid gap-3 @min-[760px]:grid-cols-2">
        {billingSnapshots.map((snapshot) => {
          const label = props.providerLabels?.[snapshot.providerId] ?? snapshot.providerId;
          const rawReset = sharedWindowResetLabel(snapshot, now);
          const resetLabel = rawReset && rawReset !== "now" ? rawReset : undefined;
          const credits = hasDisplayableCredits(snapshot.credits, snapshot.windows)
            ? snapshot.credits
            : undefined;
          const tokens = snapshot.tokens;
          const tokenParts = tokens?.total
            ? [
                tokens.input && tokens.input > 0
                  ? `${t`Input`} ${formatTokens(tokens.input)}`
                  : undefined,
                tokens.cacheRead && tokens.cacheRead > 0
                  ? `${t`Cache read`} ${formatTokens(tokens.cacheRead)}`
                  : undefined,
                tokens.cacheWrite && tokens.cacheWrite > 0
                  ? `${t`Cache write`} ${formatTokens(tokens.cacheWrite)}`
                  : undefined,
                tokens.output && tokens.output > 0
                  ? `${t`Output`} ${formatTokens(tokens.output)}`
                  : undefined,
              ].filter(Boolean)
            : [];

          return (
            <ContentSurface
              key={snapshot.providerId}
              className="flex min-w-0 flex-col gap-3 p-4"
              data-testid={`account-cycle-${snapshot.providerId}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderIcon
                    kind={snapshot.providerId}
                    fallbackLabel={label}
                    className="size-4 shrink-0"
                  />
                  <span className="truncate text-sm font-medium text-foreground">{label}</span>
                  {snapshot.plan ? (
                    <span className="truncate text-xs text-muted">{snapshot.plan}</span>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {[
                    tokens?.total && tokens.total > 0
                      ? t`${formatTokens(tokens.total)} tokens`
                      : undefined,
                    resetLabel ? t`Resets in ${resetLabel}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>

              {snapshot.windows.length > 0 ? (
                <UsageWindowBars windows={snapshot.windows} showReset={!resetLabel} />
              ) : null}

              {credits ? <UsageCreditsRow credits={credits} showSeparator /> : null}

              {snapshot.cost && !snapshot.cost.estimated ? (
                <div className="flex items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-2 text-xs">
                  <span className="text-muted">
                    <Trans>Billed spend</Trans> ({snapshot.cost.period})
                  </span>
                  <span className="tabular-nums font-medium text-foreground">
                    {formatMoney(snapshot.cost.amount, snapshot.cost.currency)}
                  </span>
                </div>
              ) : null}

              {tokenParts.length > 0 ? (
                <p className="border-t border-[var(--hairline-soft)] pt-2 text-[11px] tabular-nums text-muted">
                  {tokenParts.join(" · ")}
                </p>
              ) : null}
            </ContentSurface>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Connected wrapper mounted only inside Profile -> Costs so background usage
 * refreshes never re-render the Activity tab, while hydrating local or remote
 * host usage on demand and keeping host labels and permissions isolated.
 */
export function ProfileAccountBillingCycles(props: {
  selection: ProfileSelection;
  currentDeviceId: string | null;
}) {
  const { selection, currentDeviceId } = props;
  const remoteConnectionKey =
    selection.scope === "device" ? fromRemoteProfileDeviceId(selection.deviceId) : undefined;
  const isHistoricalLocalDevice =
    selection.scope === "device" &&
    !remoteConnectionKey &&
    Boolean(selection.deviceId) &&
    Boolean(currentDeviceId) &&
    selection.deviceId !== currentDeviceId;

  useProviderUsageHydration(!remoteConnectionKey && !isHistoricalLocalDevice);
  const hostView = useHostUsageView(
    remoteConnectionKey ?? "",
    0,
    false,
    Boolean(remoteConnectionKey),
  );
  const localUsageSnapshots = useProviderUsageStore((s) => s.snapshots);
  const agentInstances = useSharedSettings((s) => s.agentInstances);

  if (isHistoricalLocalDevice) return null;

  const allSnapshots: readonly UsageSnapshot[] = remoteConnectionKey
    ? hostView.canRead
      ? hostView.usage.snapshots
      : []
    : Object.values(localUsageSnapshots);

  const selectedProvider = selection.provider;
  const targetProviderId = selectedProvider
    ? usageProviderIdForAgent(
        selectedProvider,
        undefined,
        remoteConnectionKey ? undefined : agentInstances,
      )
    : undefined;
  const filteredSnapshots = targetProviderId
    ? allSnapshots.filter((snapshot) => snapshot.providerId === targetProviderId)
    : allSnapshots;

  const providerLabels: Record<string, string> = {};
  const providers = remoteConnectionKey
    ? resolveHostUsageProviders(allSnapshots, [], hostView.agents)
    : usageProvidersForAgentInstances(agentInstances);
  for (const provider of providers) {
    providerLabels[provider.id] = provider.label;
  }

  return <AccountBillingCycles snapshots={filteredSnapshots} providerLabels={providerLabels} />;
}
