import { Button, toast } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import {
  agentManagementHostForMachine,
  hostScopedKey,
} from "@/renderer/components/providers/settings/agentManagementHost";
import { useSelectedMachine } from "@/renderer/state/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import {
  refreshAgentDiscovery,
  refreshRemoteAgentDiscovery,
  useRemoteAgentRefreshes,
} from "@/renderer/actions/agentDiscoveryActions";
import { ModelOrderSection } from "./ModelOrderSection";
import { ModelVisibilitySection } from "./ModelVisibilitySection";
import { AgentProfileAddButton } from "./AgentProfileAddButton";
import { SettingsPage } from "./SettingsForm";

export function AgentsGeneralSettings(props: { onOpenAgentSettings: (kind: string) => void }) {
  const { t } = useLingui();
  const machine = useSelectedMachine();
  const host = agentManagementHostForMachine(machine);
  const discoveryScanning = useAgentStatusesStore((s) => s.discoveryScanning);
  const refreshKey = hostScopedKey(host.key, machine.id);
  const remoteRefreshing = useRemoteAgentRefreshes((s) => s.has(refreshKey));
  const isRefreshing = host.isRemote ? remoteRefreshing : discoveryScanning;
  const refreshAgents = async () => {
    if (isRefreshing || machine.status !== "online") return;
    try {
      const wslDistros = machine.ref.env.kind === "wsl" ? [machine.ref.env.distro] : [];
      if (host.isRemote) {
        await refreshRemoteAgentDiscovery(refreshKey, machine.label, () =>
          host.rediscoverAgents(wslDistros),
        );
      } else await refreshAgentDiscovery(wslDistros, { background: true });
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t`Unable to refresh ${machine.label}.`);
    }
  };
  return (
    <SettingsPage
      title={t`Agents · General`}
      actions={
        <div className="flex items-center gap-1.5">
          <AgentProfileAddButton
            machine={machine}
            onOpenAgentSettings={props.onOpenAgentSettings}
          />
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Refresh detected agents`}
            isPending={isRefreshing}
            isDisabled={isRefreshing || machine.status !== "online"}
            onPress={() => void refreshAgents()}
          >
            {isRefreshing ? <PixelLoader size="xs" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      }
    >
      <ModelVisibilitySection />
      <ModelOrderSection onOpenAgentSettings={props.onOpenAgentSettings} />
    </SettingsPage>
  );
}
