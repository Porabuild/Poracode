import { msg } from "@lingui/core/macro";
import { migrateClaudeUltracodeEffort } from "@/shared/agents/claudeEfforts";
import type { RendererProviderManifest } from "../providerManifest";

/** Saved configs from before ultracode became a toggle still carry it as an effort. */
function normalizeClaudeModelConfig<
  T extends { model?: string | undefined; fast?: boolean | undefined },
>(config: T): T {
  return migrateClaudeUltracodeEffort(
    config as T & { effort?: string | undefined; workflows?: boolean | undefined },
  );
}

export default {
  kind: "claude",
  label: msg`Claude Code`,
  order: 10,
  utilityOrder: 20,
  // Fast mode bills at a premium; keep it an explicit choice.
  defaultFastEnabled: false,
  normalizeModelConfig: normalizeClaudeModelConfig,
} satisfies RendererProviderManifest;
