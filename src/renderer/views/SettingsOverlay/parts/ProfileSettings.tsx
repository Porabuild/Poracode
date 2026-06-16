import { useState } from "react";
import { Pencil, Share2 } from "lucide-react";
import type { ProfileBreakdownEntry, ProfileTokenProvider } from "@/shared/contracts";
import { Button, PixelLoader } from "@/renderer/components/common";
import { useProfileData } from "@/renderer/views/ProfileOverlay/useProfileData";
import { ProfileHeader } from "@/renderer/views/ProfileOverlay/parts/ProfileHeader";
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

/** Token-weighted bars show compact counts (e.g. "2.8M"); spread when by-tokens. */
const tokenFormat = { formatValue: formatCompact };

/** Reshape a token-weighted provider/account into the generic breakdown entry. */
function toEntry(p: ProfileTokenProvider): ProfileBreakdownEntry {
  return { key: p.provider, label: p.label, count: p.tokens, percent: p.percent };
}

/** Profile + usage statistics, rendered as a Settings section. */
export function ProfileSettings() {
  const data = useProfileData();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pickedMetric, setPickedMetric] = useState<ActivityMetric | null>(null);
  const { core, coreLoading, tokens, tokensLoading } = data;

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

  if (coreLoading && !core) {
    return (
      <div className="flex h-64 items-center justify-center">
        <PixelLoader size="lg" />
      </div>
    );
  }
  if (!core) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted">
        {data.error ?? "Couldn't load your profile stats."}
      </div>
    );
  }

  // Follow the Prompts/Tokens toggle for the breakdown sections: token-weighted
  // when "tokens" is active and token data exists, else prompt-weighted activity
  // (which also covers every provider incl. all ACP agents).
  const metricIsTokens = metric === "tokens" && Boolean(tokens?.available);

  const providersByTokens = metricIsTokens && tokens!.providers.length > 0;
  const providerEntries = providersByTokens ? tokens!.providers.map(toEntry) : core.providers;

  // Per-account (per-profile) usage - only worth showing when the user actually
  // has multiple accounts/profiles (an account key carries an instance suffix).
  const accountsByTokens = metricIsTokens && tokens!.accounts.length > 0;
  const accountEntries = accountsByTokens ? tokens!.accounts.map(toEntry) : core.accounts;
  // With a single account selected the breakdown collapses to one 100% bar for
  // the account already named in the filter, so only show it when unfiltered.
  const hasMultipleAccounts =
    !data.selection.provider && accountEntries.some((a) => a.key.includes(":"));

  // Per-account filter (whole page) - only when more than one account exists.
  const accountFilter =
    core.availableAccounts.length > 1 ? (
      <AccountFilter
        value={data.selection.provider}
        options={core.availableAccounts}
        onChange={(provider) =>
          data.setSelection({
            scope: data.selection.scope,
            ...(data.selection.deviceId ? { deviceId: data.selection.deviceId } : {}),
            ...(provider ? { provider } : {}),
          })
        }
      />
    ) : null;

  const headerActions = (
    <>
      <Button size="sm" variant="ghost" onPress={() => setShareOpen(true)} className="gap-1.5">
        <Share2 className="size-4" />
        Share
      </Button>
      <Button size="sm" variant="ghost" onPress={() => setEditOpen(true)} className="gap-1.5">
        <Pencil className="size-4" />
        Edit
      </Button>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[760px] pb-8">
      <div className="flex flex-col gap-8">
        <ProfileHeader
          identity={core.identity}
          devices={data.devices}
          currentDeviceId={data.currentDeviceId}
          selection={data.selection}
          onSelect={data.setSelection}
          filter={accountFilter}
          actions={headerActions}
        />
        <StatStrip core={core} tokens={tokens} tokensLoading={tokensLoading} />
        <ActivitySection
          promptHeatmap={core.promptHeatmap}
          tokenHeatmap={tokens?.tokenHeatmap ?? null}
          tokensAvailable={tokens?.available ?? false}
          metric={metric}
          onMetricChange={handleMetricChange}
        />
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          <ActivityInsights core={core} />
          <PluginUsage items={core.skills} title="Skills" emptyText="No skills used yet." />
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          <PluginUsage
            items={core.subagents}
            title="Subagents"
            emptyText="No subagents used yet."
          />
          <PluginUsage items={core.mcps} title="MCP servers" emptyText="No MCP tools used yet." />
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          <BreakdownBars
            title="Providers"
            caption={providersByTokens ? "by tokens" : "by prompts"}
            entries={providerEntries}
            loading={tokensLoading && !tokens}
            loadingRows={Math.min(4, Math.max(1, core.providers.length || 4))}
            emptyText="No activity yet."
            {...(providersByTokens ? tokenFormat : {})}
          />
          <ModelUsage
            tokens={tokens}
            coreModels={core.models}
            tokensLoading={tokensLoading}
            metric={metric}
          />
        </div>
        {hasMultipleAccounts ? (
          <BreakdownBars
            title="Accounts"
            caption={accountsByTokens ? "by tokens" : "by prompts"}
            entries={accountEntries}
            limit={12}
            {...(accountsByTokens ? tokenFormat : {})}
          />
        ) : null}
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          <BreakdownBars title="Modes" entries={core.modes} emptyText="No threads yet." />
          <AiActions actions={core.aiActions} />
        </div>
      </div>

      <EditProfileDialog
        open={editOpen}
        identity={core.identity}
        onClose={() => setEditOpen(false)}
        onSave={data.saveIdentity}
      />
      <ShareDialog
        open={shareOpen}
        core={core}
        tokens={tokens}
        metric={metric}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
