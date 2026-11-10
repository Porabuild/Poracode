import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { PixelLoader } from "@/renderer/components/common";
import { agentManagementHostForMachine } from "@/renderer/components/providers/settings/agentManagementHost";
import { useSelectedMachine } from "@/renderer/state/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { refreshAgentDiscovery } from "@/renderer/actions/agentDiscoveryActions";
import { ModelOrderSection } from "./ModelOrderSection";
import { ModelVisibilitySection } from "./ModelVisibilitySection";
import { SettingsPage } from "./SettingsForm";

export function AgentsGeneralSettings() {
  const { t } = useLingui();
  const machine = useSelectedMachine();
  const host = agentManagementHostForMachine(machine);
  const discoveryScanning = useAgentStatusesStore((s) => s.discoveryScanning);
  const [refreshingMachines, setRefreshingMachines] = useState<string[]>([]);
  const isRefreshing =
    refreshingMachines.includes(machine.id) || (!host.isRemote && discoveryScanning);
  const refreshAgents = async () => {
    if (isRefreshing || machine.status !== "online") return;
    setRefreshingMachines((current) => [...current, machine.id]);
    try {
      const wslDistros = machine.ref.env.kind === "wsl" ? [machine.ref.env.distro] : [];
      if (host.isRemote) await host.rediscoverAgents(wslDistros);
      else await refreshAgentDiscovery(wslDistros, { background: true });
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t`Unable to refresh ${machine.label}.`);
    } finally {
      setRefreshingMachines((current) => current.filter((id) => id !== machine.id));
    }
  };
  return (
    <SettingsPage
      title={t`Agents · General`}
      actions={
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
      }
    >
      <ModelVisibilitySection />
      <ModelOrderSection />
    </SettingsPage>
  );
}
