import { Trans, useLingui } from "@lingui/react/macro";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { expandAgentToVisibilityProviders } from "@/renderer/components/thread/buildModelPickerControls";
import { providerVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { resolveHiddenModelIds } from "@/shared/agentSelection";
import { ModelVisibilityPopover } from "./ModelVisibilityPopover";

export function ModelVisibilitySection() {
  const { t } = useLingui();
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);

  const installedAgents = getSettingsInstalledAgents(agentStatuses, wslAgentStatuses);
  const providers = installedAgents.flatMap(expandAgentToVisibilityProviders);

  if (providers.length === 0) return null;

  const hiddenIdsByKey: Record<string, readonly string[]> = {};
  for (const provider of providers) {
    const key = providerVisibilityKey(provider);
    hiddenIdsByKey[key] = resolveHiddenModelIds(provider.capabilities, hiddenModels[key]);
  }

  return (
    <div
      id="agentsGeneral.visibleModels"
      data-settings-anchor="agentsGeneral.visibleModels"
      className="flex scroll-mt-4 items-center justify-between gap-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          <Trans>Visible models</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>Hide models you don&apos;t use from the model picker across every provider.</Trans>
        </p>
      </div>
      <ModelVisibilityPopover
        providers={providers}
        hiddenIdsByKey={hiddenIdsByKey}
        onHiddenIdsChange={(key, next) => setHiddenModels(key, next)}
        listAriaLabel={t`Visible models`}
        summaryKind="visible"
        triggerClassName="min-w-[5rem] tabular-nums"
      />
    </div>
  );
}
