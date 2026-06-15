import { useEffect, useRef, useState } from "react";
import { Pencil, Share2 } from "lucide-react";
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
import { AiActions } from "@/renderer/views/ProfileOverlay/parts/AiActions";
import { EditProfileDialog } from "@/renderer/views/ProfileOverlay/parts/EditProfileDialog";
import { ShareDialog } from "@/renderer/views/ProfileOverlay/parts/ShareDialog";

/** Profile + usage statistics, rendered as a Settings section. */
export function ProfileSettings() {
  const data = useProfileData();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [metric, setMetric] = useState<ActivityMetric>("prompts");
  const { core, coreLoading, tokens, tokensLoading } = data;

  // Default to Tokens once token stats resolve, until the user explicitly picks
  // a metric. If the selected scope has no token data, keep the active tab valid.
  const userPickedMetric = useRef(false);
  useEffect(() => {
    if (!tokens) return;
    if (!tokens.available) {
      if (metric === "tokens") setMetric("prompts");
      return;
    }
    if (!userPickedMetric.current) setMetric("tokens");
  }, [tokens, metric]);
  const handleMetricChange = (next: ActivityMetric) => {
    userPickedMetric.current = true;
    setMetric(next);
  };

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

  // Prefer token-weighted per-provider usage (covers every provider incl. all
  // ACP agents) once token stats resolve; fall back to prompt-weighted activity.
  const providersByTokens = Boolean(tokens?.available && tokens.providers.length > 0);
  const providerEntries = providersByTokens
    ? tokens!.providers.map((p) => ({
        key: p.provider,
        label: p.label,
        count: p.tokens,
        percent: p.percent,
      }))
    : core.providers;

  // Per-account (per-profile) usage - only worth showing when the user actually
  // has multiple accounts/profiles (an account key carries an instance suffix).
  const accountsByTokens = Boolean(tokens?.available && tokens.accounts.length > 0);
  const accountEntries = accountsByTokens
    ? tokens!.accounts.map((a) => ({
        key: a.provider,
        label: a.label,
        count: a.tokens,
        percent: a.percent,
      }))
    : core.accounts;
  const hasMultipleAccounts = accountEntries.some((a) => a.key.includes(":"));

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
          <PluginUsage items={core.skills} />
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          <BreakdownBars
            title="Providers"
            caption={providersByTokens ? "by tokens" : "by prompts"}
            entries={providerEntries}
            loading={tokensLoading && !tokens}
            loadingRows={Math.min(4, Math.max(1, core.providers.length || 4))}
            emptyText="No activity yet."
          />
          <ModelUsage tokens={tokens} coreModels={core.models} tokensLoading={tokensLoading} />
        </div>
        {hasMultipleAccounts ? (
          <BreakdownBars
            title="Accounts"
            caption={accountsByTokens ? "by tokens" : "by prompts"}
            entries={accountEntries}
            limit={12}
          />
        ) : null}
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          <BreakdownBars
            title="Threads"
            caption="by mode"
            entries={core.modes}
            emptyText="No threads yet."
          />
          <PluginUsage items={core.mcps} title="MCP servers" emptyText="No MCP tools used yet." />
        </div>
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
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
