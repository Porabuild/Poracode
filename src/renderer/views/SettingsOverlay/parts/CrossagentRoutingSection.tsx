import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { Trash2 } from "lucide-react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button, TextArea } from "@/renderer/components/common";
import { distinctSubProviderLabel } from "@/renderer/components/common/ProviderModelMenu";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type {
  CrossagentRoutingSnapshotEntry,
  CrossagentRoutingState,
} from "@/shared/crossagentRanking";
import { presentedCrossagentCapabilities } from "@/shared/crossagentVisibility";
import { formatReasoningLabel } from "@/shared/modelLabels";
import { CrossagentMemorySection } from "./crossagent/CrossagentMemorySection";
import { CrossagentProviderModelFilter } from "./crossagent/CrossagentProviderModelFilter";
import { CrossagentRankedRow } from "./crossagent/CrossagentRankedRow";

/**
 * Crossagents routing settings: the live globally ranked (provider, model)
 * order with one global provider/model checklist (unchecked providers and
 * models are skipped by Crossagents), the editable learned routing memory,
 * user-pinned task routes, and the free-text routing guide appended to the
 * Crossagents MCP instructions.
 */
export function CrossagentRoutingSection() {
  const { t } = useLingui();
  const crossagentRoutingGuide = useSharedSettings((s) => s.crossagentRoutingGuide);
  const crossagentSelectionUsage = useSharedSettings((s) => s.crossagentSelectionUsage);
  const crossagentRoutingOverrides = useSharedSettings((s) => s.crossagentRoutingOverrides);
  const crossagentPausedProviders = useSharedSettings((s) => s.crossagentPausedProviders);
  const crossagentHiddenModels = useSharedSettings((s) => s.crossagentHiddenModels);
  const agentSelectionUsage = useSharedSettings((s) => s.agentSelectionUsage);
  const favoriteModels = useSharedSettings((s) => s.favoriteModels);
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const statuses = useAgentStatusesStore((s) => s.agentStatuses);
  const setCrossagentRoutingGuide = useSharedSettings((s) => s.setCrossagentRoutingGuide);
  const [draft, setDraft] = useState(crossagentRoutingGuide);
  const [routing, setRouting] = useState<CrossagentRoutingState>({ ranked: [], providers: [] });
  const [removingRoute, setRemovingRoute] = useState<string | null>(null);
  // Eligible providers missing from the ranked order were excluded by the
  // user's checklist (paused, or every model unchecked) — keep them glanceable
  // while the popover is closed.
  const rankedProviderKinds = new Set(routing.ranked.map((entry) => entry.provider));
  const skippedProviderNames = routing.providers
    .filter((provider) => !rankedProviderKinds.has(provider.kind))
    .map((provider) => provider.label);

  // Ranked rows are per-model, so resolve each provider's presented capability
  // once instead of rebuilding it for every row.
  const capabilitiesByKind = new Map(
    routing.providers.flatMap((provider) => {
      const status = statuses.find((candidate) => candidate.kind === provider.kind);
      if (!status) return [];
      return [
        [
          provider.kind,
          presentedCrossagentCapabilities(provider.execution, status.capabilities),
        ] as const,
      ];
    }),
  );

  // Aggregator providers (OpenCode, Command Code, …) expose same-label models
  // from different sub-providers; surface the sub-provider to tell them apart.
  function subProviderLabelFor(entry: CrossagentRoutingSnapshotEntry): string | undefined {
    const capabilities = capabilitiesByKind.get(entry.provider);
    if (!capabilities) return undefined;
    return distinctSubProviderLabel(entry.model.id, capabilities, entry.label);
  }
  useEffect(() => {
    let active = true;
    void readBridge()
      .getCrossagentRouting()
      .then((state) => {
        if (active) setRouting(state);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    statuses,
    disabledAgents,
    hiddenModels,
    crossagentPausedProviders,
    crossagentHiddenModels,
    crossagentSelectionUsage,
    crossagentRoutingOverrides,
    agentSelectionUsage,
    favoriteModels,
  ]);

  async function removePinnedRoute(tags: string[]) {
    const key = tags.join(" ");
    setRemovingRoute(key);
    try {
      const nextOverrides = await readBridge().removeCrossagentRoutingOverride({
        tags,
      });
      useSharedSettings.setState({ crossagentRoutingOverrides: nextOverrides });
    } catch {
      toast.danger(t`Unable to remove pinned route.`);
    } finally {
      setRemovingRoute(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            <Trans>Current routing order</Trans>
          </p>
          <CrossagentProviderModelFilter providers={routing.providers} />
        </div>
        <p className="text-xs text-muted">
          <Trans>
            Agents classify delegated work with task tags. Manual task routes rank first, followed
            by matching learned routes, global Crossagents usage, normal agent usage and favorites,
            and built-in order.
          </Trans>
        </p>
        {routing.ranked.length > 0 ? (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {routing.ranked.map((entry) => {
              const subProviderLabel = subProviderLabelFor(entry);
              return (
                <CrossagentRankedRow
                  key={`${entry.provider}:${entry.model.id}`}
                  entry={entry}
                  {...(subProviderLabel ? { subProviderLabel } : {})}
                />
              );
            })}
          </div>
        ) : null}
        {skippedProviderNames.length > 0 ? (
          <p className="text-xs text-muted">
            {t`Skipped by Crossagents: ${skippedProviderNames.join(", ")}`}
          </p>
        ) : null}
        <p className="text-xs text-muted">
          <Trans>
            Anything currently unavailable — a provider, model, reasoning level, or Fast mode — is
            skipped automatically. Unchecked providers and models are skipped until re-checked.
          </Trans>
        </p>
        {crossagentRoutingOverrides.length > 0 ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                <Trans>Pinned task routes</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>
                  Manual routes override learned routing whenever all of their task tags match.
                </Trans>
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              {crossagentRoutingOverrides.map((override) => {
                const key = override.tags.join(" ");
                const routeDetail = [
                  override.agentKind,
                  override.modelId,
                  ...(override.effort ? [formatReasoningLabel(override.effort)] : []),
                  ...(override.fast === true ? [t`Fast`] : []),
                ]
                  .filter(Boolean)
                  .join(" · ");
                const providerAvailable = rankedProviderKinds.has(override.agentKind);
                const tagLabel = override.tags.map((tag) => `#${tag}`).join(" + ");
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground">{tagLabel}</p>
                      <p className="truncate text-xs text-muted">
                        {routeDetail}
                        {!providerAvailable ? ` · ${t`Unavailable provider`}` : null}
                      </p>
                    </div>
                    {!isRemoteSession() ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={t`Remove pinned route for ${tagLabel}`}
                        isPending={removingRoute === key}
                        onPress={() => void removePinnedRoute(override.tags)}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
      <CrossagentMemorySection />
      <section className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>Crossagent routing guide</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            Instructions agents follow when choosing which agent or model to delegate to.
          </Trans>
        </p>
        <TextArea
          aria-label={t`Crossagent routing guide`}
          className="w-full text-xs"
          rows={4}
          placeholder={t`e.g. Codex GPT-5.5 fast for quick lookups, OpenCode GLM for bulk refactors, Claude Opus for anything subtle.`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setCrossagentRoutingGuide(draft.trim())}
        />
      </section>
    </div>
  );
}
