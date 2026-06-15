import type { ProfileBreakdownEntry, ProfileTokenStats } from "@/shared/contracts";
import { BreakdownBars } from "./BreakdownBars";

export function ModelUsage(props: {
  tokens: ProfileTokenStats | null;
  coreModels: ProfileBreakdownEntry[];
  tokensLoading: boolean;
}) {
  const { tokens, coreModels, tokensLoading } = props;

  // Wait for token stats before choosing the source so the section doesn't flip
  // from prompt-weighted to token-weighted (a reflow) mid-render.
  const pending = tokensLoading && !tokens;
  const byTokens = tokens?.available && tokens.models.length > 0;
  const models = byTokens ? tokens!.models : coreModels;

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
      {...(footer ? { footer } : {})}
    />
  );
}
