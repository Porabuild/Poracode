import { Trans, useLingui } from "@lingui/react/macro";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { machineIdForStatus, useSelectedMachine } from "@/renderer/state/machines";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { localMachineKey } from "@/shared/machines";
import { effectiveProviderOrder } from "@/shared/machineSettings";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";
import {
  buildProviderVisibilityCatalog,
  resolveEffectiveHiddenIdsByKey,
} from "./modelVisibilityCatalog";
import { ProviderModelVisibilityPopover } from "./ProviderModelVisibilityPopover";

const RUNTIME_SLOTS_BY_BASE_KIND: ReadonlyMap<string, NativeAgentRuntimeSlots> = new Map(
  NATIVE_AGENT_REGISTRY_ENTRIES.flatMap((entry) =>
    entry.runtimeSlots ? [[entry.id, entry.runtimeSlots] as const] : [],
  ),
);

export function ModelVisibilitySection() {
  const { t } = useLingui();
  const selectedMachine = useSelectedMachine();
  const machineHost =
    selectedMachine.ref.host === "remote" ? selectedMachine.ref.desktopId : undefined;
  const pools = useHostAgentStatusPools(machineHost);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const activeOrder = useSharedSettings((s) => effectiveProviderOrder(s, selectedMachine.id));
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);

  const machineEnvId = localMachineKey(selectedMachine.ref.env);
  const installedAgents = getSettingsInstalledAgents(
    pools.windows.filter((status) => machineIdForStatus(status) === machineEnvId),
    pools.wsl.filter((status) => machineIdForStatus(status) === machineEnvId),
  );

  const { groups, surfaceProviders } = buildProviderVisibilityCatalog({
    agents: installedAgents,
    providerOrder: activeOrder,
    runtimeSlotsByBaseKind: RUNTIME_SLOTS_BY_BASE_KIND,
  });

  if (groups.length === 0) return null;

  const hiddenIdsByKey = resolveEffectiveHiddenIdsByKey(surfaceProviders, hiddenModels);

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
      <ProviderModelVisibilityPopover
        groups={groups}
        hiddenIdsByKey={hiddenIdsByKey}
        onHiddenIdsChange={(updates) => {
          for (const [key, next] of updates) {
            setHiddenModels(key, next);
          }
        }}
        listAriaLabel={t`Visible models`}
        triggerClassName="min-w-[5rem] tabular-nums"
      />
    </div>
  );
}
