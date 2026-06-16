import type { ProfileBreakdownEntry, ProfileTokenStats } from "@/shared/contracts";
import { formatCompact } from "../format";
import type { ActivityMetric } from "./ActivitySection";
import { BreakdownBars } from "./BreakdownBars";

export function ModelUsage(props: {
  tokens: ProfileTokenStats | null;
  coreModels: ProfileBreakdownEntry[];
  tokensLoading: boolean;
  metric: ActivityMetric;
}) {
  const { tokens, coreModels, tokensLoading, metric } = props;

  // Follow the Prompts/Tokens toggle: token-weighted when "tokens" is active and
  // token data exists, otherwise the prompt-weighted core mix.
  const byTokens = metric === "tokens" && Boolean(tokens?.available) && tokens!.models.length > 0;
  const models = byTokens ? tokens!.models : coreModels;
  // Hold a skeleton until the token rollup resolves (matching the Providers
  // column) so the default token view doesn't briefly paint the prompt mix then
  // reflow once tokens arrive.
  const pending = tokensLoading && !tokens;

  if (!pending && models.length === 0) return null;

  const footer =
    byTokens && tokens!.providers.length > 0 ? (
      <p className="pt-1 text-[11px] text-muted/60">
        Tokens from {tokens!.providers.map((p) => p.label).join(", ")}
      </p>
    ) : undefined;

  return (
    <BreakdownBars
      title="Model usage"
      caption={byTokens ? "by tokens" : "by prompts"}
      entries={models}
      loading={pending}
      loadingRows={Math.min(4, Math.max(1, coreModels.length || 4))}
      {...(byTokens ? { formatValue: formatCompact } : {})}
      {...(footer ? { footer } : {})}
    />
  );
}
