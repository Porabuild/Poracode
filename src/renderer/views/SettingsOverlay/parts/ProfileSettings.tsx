import { useState } from "react";
import { Pencil, Share2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  ProfileBreakdownEntry,
  ProfileStatsWindow,
  ProfileTokenProvider,
} from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import { Button, LightballTabs, type LightballTab } from "@/renderer/components/common";
import { useProfileData } from "@/renderer/views/ProfileOverlay/useProfileData";
import {
  ProfileHeader,
  ProfileIdentityHeading,
} from "@/renderer/views/ProfileOverlay/parts/ProfileHeader";
import { StatStrip } from "@/renderer/views/ProfileOverlay/parts/StatStrip";
import {
  ActivitySection,
  type ActivityMetric,
} from "@/renderer/views/ProfileOverlay/parts/ActivitySection";
import { ActivityInsights } from "@/renderer/views/ProfileOverlay/parts/ActivityInsights";
import { PluginUsage } from "@/renderer/views/ProfileOverlay/parts/PluginUsage";
import { ModelUsage } from "@/renderer/views/ProfileOverlay/parts/ModelUsage";
import { BreakdownBars } from "@/renderer/views/ProfileOverlay/parts/BreakdownBars";
import { AccountFilter } from "@/renderer/views/ProfileOverlay/parts/AccountFilter";
import { AiActions } from "@/renderer/views/ProfileOverlay/parts/AiActions";
import { EditProfileDialog } from "@/renderer/views/ProfileOverlay/parts/EditProfileDialog";
import { ShareDialog } from "@/renderer/views/ProfileOverlay/parts/ShareDialog";
import { formatCompact } from "@/renderer/views/ProfileOverlay/format";
import { CostHistory } from "@/renderer/views/ProfileOverlay/parts/CostHistory";

/** Token-weighted bars show compact counts (e.g. "2.8M"); spread when by-tokens. */
const tokenFormat = { formatValue: formatCompact };

/** Reshape a token-weighted provider/account into the generic breakdown entry. */
function toEntry(p: ProfileTokenProvider): ProfileBreakdownEntry {
  return { key: p.provider, label: p.label, count: p.tokens, percent: p.percent };
}

/** Profile + usage statistics, rendered as a Settings section. */
export function ProfileSettings() {
  const { t, i18n } = useLingui();
  const data = useProfileData();
  // Sharing takes a native clipboard screenshot of the page (copyShareImage),
  // which has no remote equivalent; hide the affordance rather than surface a
  // dead button. Editing identity still works remotely via setProfileIdentity.
  const remote = isRemoteSession();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tab, setTab] = useState<"activity" | "costs">("activity");
  const [tabMotion, setTabMotion] = useState<"none" | "from-right" | "from-left">("none");
  const [pickedMetric, setPickedMetric] = useState<ActivityMetric | null>(null);
  const { core, coreLoading, tokens, tokensLoading } = data;
  const identity = data.identity ?? null;
  const corePending = coreLoading && !core;
  const hasError =
    (tab === "activity" && !core && !coreLoading) || (tab === "costs" && !tokens && !tokensLoading);

  const handleTabChange = (next: "activity" | "costs") => {
    if (next === tab) return;
    setTabMotion(next === "costs" ? "from-right" : "from-left");
    setTab(next);
  };

  // Resolve the active metric at render time (not via a post-paint effect) so the
  // breakdown sections never paint the prompt mix for a frame before flipping to
  // tokens. Default to Tokens once token data exists; a user pick wins, but a
  // "tokens" pick downgrades to prompts when the selected scope has no tokens.
  const tokensAvailable = Boolean(tokens?.available);
  const metric: ActivityMetric =
    pickedMetric === "tokens" && !tokensAvailable
      ? "prompts"
      : (pickedMetric ?? (tokensAvailable ? "tokens" : "prompts"));
  const handleMetricChange = (next: ActivityMetric) => setPickedMetric(next);
  const windowTabs: ReadonlyArray<LightballTab<ProfileStatsWindow>> = [
    { id: "7d", label: t`7d` },
    { id: "30d", label: t`30d` },
    { id: "all", label: t`All` },
  ];
  const profileTabs: ReadonlyArray<LightballTab<"activity" | "costs">> = [
    { id: "activity", label: t`Activity` },
    { id: "costs", label: t`Costs` },
  ];

  // Follow the Prompts/Tokens toggle for the breakdown sections: token-weighted
  // when "tokens" is active and token data exists, else prompt-weighted activity
  // (which also covers every provider incl. all ACP agents).
  const metricIsTokens = metric === "tokens" && Boolean(tokens?.available);

  const providersByTokens = metricIsTokens && tokens!.providers.length > 0;
  const providerEntries = providersByTokens
    ? tokens!.providers.map(toEntry)
    : (core?.providers ?? []);

  // Per-account (per-profile) usage - only worth showing when the user actually
  // has multiple accounts/profiles (an account key carries an instance suffix).
  const accountsByTokens = metricIsTokens && tokens!.accounts.length > 0;
  const accountEntries = accountsByTokens ? tokens!.accounts.map(toEntry) : (core?.accounts ?? []);
  // With a single account selected or only one account present in the range,
  // the breakdown collapses to one 100% bar duplicating Providers, so only show
  // it when unfiltered with multiple accounts.
  const hasMultipleAccounts =
    !data.selection.provider &&
    accountEntries.length > 1 &&
    accountEntries.some((a) => a.key.includes(":"));

  // Per-account filter (whole page) - only when more than one account exists.
  const accountFilter =
    (core?.availableAccounts.length ?? 0) > 1 ? (
      <AccountFilter
        value={data.selection.provider}
        options={core!.availableAccounts}
        onChange={(provider) =>
          data.setSelection({
            scope: data.selection.scope,
            window: data.selection.window,
            ...(data.selection.deviceId ? { deviceId: data.selection.deviceId } : {}),
            ...(provider ? { provider } : {}),
          })
        }
      />
    ) : null;

  const editAction = (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={t`Edit`}
      isDisabled={!identity}
      onPress={() => setEditOpen(true)}
    >
      <Pencil className="size-4" />
    </Button>
  );

  const shareAction = !remote ? (
    <Button
      size="sm"
      variant="secondary"
      isDisabled={
        !core || Boolean(core.incompleteDetails?.streaks) || Boolean(tokens?.incompletePeak)
      }
      onPress={() => setShareOpen(true)}
      className="gap-1.5"
    >
      <Share2 className="size-3.5" />
      <Trans>Share</Trans>
    </Button>
  ) : null;

  const tabMotionClass =
    tabMotion === "from-right"
      ? "poracode-tab-panel-from-right"
      : tabMotion === "from-left"
        ? "poracode-tab-panel-from-left"
        : "";

  return (
    <div className="mx-auto w-full max-w-[1080px] pb-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <LightballTabs
              tabs={profileTabs}
              active={tab}
              onChange={handleTabChange}
              ariaLabel={t`Profile tabs`}
              className="shrink-0"
              shape="rounded"
              delayActiveText
            />
            <LightballTabs
              tabs={windowTabs}
              active={data.selection.window}
              onChange={(window) => data.setSelection({ ...data.selection, window })}
              ariaLabel={t`Profile stats range`}
              className="w-[180px] shrink-0"
              equalWidth
              shape="rounded"
              delayActiveText
            />
          </div>
          <ProfileHeader
            devices={data.devices}
            currentDeviceId={data.currentDeviceId}
            {...(data.remoteStatusByDeviceId
              ? { remoteStatusByDeviceId: data.remoteStatusByDeviceId }
              : {})}
            selection={data.selection}
            onSelect={data.setSelection}
            filter={accountFilter}
            actions={editAction}
          />
        </div>
        {hasError ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
            <p>{data.error ?? t`Couldn't load your profile stats.`}</p>
            {data.retry ? (
              <Button size="sm" variant="secondary" onPress={data.retry}>
                <Trans>Retry</Trans>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-clip">
            {tab === "activity" && (
              <div
                key="activity"
                role="tabpanel"
                aria-label={t`Activity`}
                aria-busy={corePending || tokensLoading}
                className={`@container flex min-w-0 flex-col gap-6 ${tabMotionClass}`}
              >
                {(corePending || tokensLoading) && (
                  <span role="status" className="sr-only">
                    <Trans>Loading</Trans>
                  </span>
                )}
                <ProfileIdentityHeading identity={identity} actions={shareAction} />
                <ActivitySection
                  core={core}
                  coreLoading={corePending}
                  tokens={tokens}
                  tokensLoading={tokensLoading}
                  window={data.selection.window}
                  metric={metric}
                  defaultToTokensWhileLoading={pickedMetric === null}
                  onMetricChange={handleMetricChange}
                  peakAvailable={!tokens?.incompletePeak}
                />
                <StatStrip
                  core={core}
                  coreLoading={corePending}
                  tokens={tokens}
                  tokensLoading={tokensLoading}
                  streaksAvailable={!core?.incompleteDetails?.streaks}
                  peakAvailable={!tokens?.incompletePeak}
                />
                <ActivityInsights
                  core={core}
                  tokens={tokens}
                  envs={data.envSummaries ?? []}
                  window={data.selection.window}
                  loading={corePending}
                  skillsAvailable={!core?.incompleteDetails?.skills}
                />
                <div className="grid grid-cols-1 gap-6 @min-[640px]:grid-cols-2">
                  <PluginUsage
                    items={core?.skills ?? []}
                    title={t`Skills`}
                    emptyText={
                      core?.incompleteDetails?.skills
                        ? t`Select a device to view these details.`
                        : t`No skills used yet.`
                    }
                    loading={corePending}
                  />
                  <PluginUsage
                    items={core?.mcps ?? []}
                    title={t`MCP servers`}
                    emptyText={
                      core?.incompleteDetails?.mcps
                        ? t`Select a device to view these details.`
                        : t`No MCP tools used yet.`
                    }
                    loading={corePending}
                  />
                </div>
                <div className="grid grid-cols-1 gap-6 @min-[640px]:grid-cols-2">
                  <BreakdownBars
                    title={t`Providers`}
                    caption={providersByTokens ? t`by tokens` : t`by prompts`}
                    entries={providerEntries}
                    loading={corePending || (tokensLoading && !tokens)}
                    loadingRows={Math.min(4, Math.max(1, (core?.providers.length ?? 0) || 4))}
                    emptyText={t`No activity yet.`}
                    {...(providersByTokens ? tokenFormat : {})}
                  />
                  <ModelUsage
                    tokens={tokens}
                    coreModels={core?.models ?? []}
                    tokensLoading={tokensLoading || corePending}
                    metric={metric}
                  />
                </div>
                {hasMultipleAccounts ? (
                  <BreakdownBars
                    title={t`Accounts`}
                    caption={accountsByTokens ? t`by tokens` : t`by prompts`}
                    entries={accountEntries}
                    limit={12}
                    {...(accountsByTokens ? tokenFormat : {})}
                  />
                ) : null}
                <div className="grid grid-cols-1 gap-6 @min-[640px]:grid-cols-2">
                  <BreakdownBars
                    title={t`Modes`}
                    entries={core?.modes ?? []}
                    loading={corePending}
                    loadingRows={2}
                    emptyText={t`No threads yet.`}
                  />
                  <AiActions actions={core?.aiActions ?? []} loading={corePending} />
                </div>
              </div>
            )}
            {tab === "costs" && (
              <div key="costs" role="tabpanel" aria-label={t`Costs`} className={tabMotionClass}>
                <CostHistory
                  stats={tokens?.costs}
                  loading={tokensLoading && !tokens?.costs}
                  locale={i18n.locale}
                  allDevices={data.selection.scope === "all" && data.devices.length > 1}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {identity ? (
        <EditProfileDialog
          open={editOpen}
          identity={identity}
          onClose={() => setEditOpen(false)}
          onSave={data.saveIdentity}
        />
      ) : null}
      {core ? (
        <ShareDialog
          open={shareOpen}
          core={core}
          tokens={tokens}
          metric={metric}
          window={data.selection.window}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>
  );
}
