import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { agentManagementHostForMachine } from "@/renderer/components/providers/settings/agentManagementHost";
import { updateHostHiddenModels } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { usePairedHostSettings } from "@/renderer/state/pairedHostSettings";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { machineIdForStatus, useSelectedMachine } from "@/renderer/state/machines";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { localMachineKey } from "@/shared/machines";
import { effectiveProviderOrder } from "@/shared/machineSettings";
import { friendlyError } from "@/shared/messages";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";
import {
  buildProviderVisibilityCatalog,
  resolveEffectiveHiddenIdsByKey,
} from "./modelVisibilityCatalog";
import { ProviderModelVisibilityPopover } from "./ProviderModelVisibilityPopover";

const EMPTY_HIDDEN_MODELS: Record<string, string[]> = Object.freeze({});
const EMPTY_PROVIDER_ORDER: readonly string[] = Object.freeze([]);

const RUNTIME_SLOTS_BY_BASE_KIND: ReadonlyMap<string, NativeAgentRuntimeSlots> = new Map(
  NATIVE_AGENT_REGISTRY_ENTRIES.flatMap((entry) =>
    entry.runtimeSlots ? [[entry.id, entry.runtimeSlots] as const] : [],
  ),
);

export function ModelVisibilitySection() {
  const { t } = useLingui();
  const selectedMachine = useSelectedMachine();
  const agentHost = agentManagementHostForMachine(selectedMachine);
  const connectionKey = agentHost.isRemote ? agentHost.connectionKey : undefined;
  const isRemote = connectionKey !== undefined;
  const pools = useHostAgentStatusPools(agentHost.connectionKey);
  const localHiddenModels = useSharedSettings((s) =>
    isRemote ? EMPTY_HIDDEN_MODELS : s.hiddenModels,
  );
  const localOrder = useSharedSettings((s) =>
    isRemote ? EMPTY_PROVIDER_ORDER : effectiveProviderOrder(s, selectedMachine.id),
  );
  const remoteEntry = usePairedHostSettings(connectionKey);
  const hiddenModels = isRemote
    ? (remoteEntry?.settings?.hiddenModels ?? EMPTY_HIDDEN_MODELS)
    : localHiddenModels;
  const activeOrder = isRemote
    ? (remoteEntry?.settings?.providerOrder ?? EMPTY_PROVIDER_ORDER)
    : localOrder;
  const isReady = isRemote
    ? selectedMachine.status === "online" && remoteEntry?.settings !== undefined
    : selectedMachine.status === "online";

  const machineEnvId = localMachineKey(selectedMachine.ref.env);
  const installedAgents = getSettingsInstalledAgents(
    pools.windows.filter((status) => machineIdForStatus(status) === machineEnvId),
    pools.wsl.filter((status) => machineIdForStatus(status) === machineEnvId),
  );

  const { groups, surfaceProviders } = buildProviderVisibilityCatalog({
    agents: installedAgents,
    providerOrder: [...activeOrder],
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
        isDisabled={!isReady}
        onHiddenIdsChange={(updates) => {
          const pending = updateHostHiddenModels(connectionKey, updates);
          if (pending) {
            void pending.catch((error) => toast.danger(friendlyError(error)));
          }
        }}
        listAriaLabel={t`Visible models`}
        triggerClassName="min-w-[5rem] tabular-nums"
      />
    </div>
  );
}
