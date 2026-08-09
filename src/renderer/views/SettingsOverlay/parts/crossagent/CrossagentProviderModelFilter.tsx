import { Trans, useLingui } from "@lingui/react/macro";
import { statusToMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { CrossagentRoutingProviderEntry } from "@/shared/crossagentRanking";
import {
  globalVisibleCrossagentCapabilities,
  presentedCrossagentCapabilities,
} from "@/shared/crossagentVisibility";
import { ModelVisibilityPopover } from "../ModelVisibilityPopover";

/**
 * The single Crossagents-only visibility control: one popover checklist over
 * every eligible provider and its models. Unchecking a provider pauses it
 * (skipped by Crossagents until re-checked); unchecking a model hides it from
 * Crossagents without touching the global composer visibility.
 */
export function CrossagentProviderModelFilter(props: {
  providers: CrossagentRoutingProviderEntry[];
}) {
  const { t } = useLingui();
  const statuses = useAgentStatusesStore((s) => s.agentStatuses);
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const crossagentHiddenModels = useSharedSettings((s) => s.crossagentHiddenModels);
  const crossagentPausedProviders = useSharedSettings((s) => s.crossagentPausedProviders);
  const setCrossagentHiddenModels = useSharedSettings((s) => s.setCrossagentHiddenModels);
  const setCrossagentProviderPaused = useSharedSettings((s) => s.setCrossagentProviderPaused);

  const menuProviders = props.providers.flatMap((entry) => {
    const status = statuses.find((candidate) => candidate.kind === entry.kind);
    if (!status) return [];
    return [
      {
        ...statusToMenuProvider(status),
        // `crossagentHiddenModels` is keyed by plain agent kind (see
        // `filterCrossagentCapabilities`), so pin the popover's persistence key
        // to it rather than letting it derive a surface-qualified one.
        hiddenModelsKey: entry.kind,
        capabilities: globalVisibleCrossagentCapabilities(
          entry.kind,
          entry.execution,
          presentedCrossagentCapabilities(entry.execution, status.capabilities),
          { disabledAgents, hiddenModels },
        ),
      },
    ];
  });
  if (menuProviders.length === 0) return null;

  const ariaLabel = t`Crossagents auto-selection`;
  return (
    <ModelVisibilityPopover
      providers={menuProviders}
      hiddenIdsByKey={crossagentHiddenModels}
      onHiddenIdsChange={(key, next) => setCrossagentHiddenModels(key, next)}
      providerToggle={{
        uncheckedKinds: crossagentPausedProviders,
        onCheckedChange: (kind, checked) => setCrossagentProviderPaused(kind, !checked),
      }}
      triggerLabel={<Trans>Auto-selection</Trans>}
      listAriaLabel={ariaLabel}
      summaryKind="usable"
      footer={
        <Trans>
          Unchecked providers and models are excluded from automatic Crossagents routing, but remain
          available for manual agent threads.
        </Trans>
      }
      compactTriggerCount
      triggerAriaLabel={ariaLabel}
      triggerClassName="shrink-0 tabular-nums"
    />
  );
}
