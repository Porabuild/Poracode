import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { Plus } from "lucide-react";
import { friendlyError } from "@/shared/messages";
import { isRemoteSession, isWindows } from "@/renderer/bridge";
import type { AgentStatus } from "@/shared/contracts";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useAppStore } from "@/renderer/state/appStore";
import { findProjectForMachine } from "@/renderer/utils/acpRegistryAuth";
import {
  AgentSettingsHostProvider,
  createAgentSettingsHost,
  useAgentSettingsHost,
  useHostAgentInstances,
  useRemoteHostCanWrite,
  useRemoteHostTerminalAccess,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { agentManagementHostForMachine } from "@/renderer/components/providers/settings/agentManagementHost";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { AgentProfileDialog } from "./AgentProfileDialog";
import { refreshAgentProfiles } from "./agentProfileCreate";
import { agentProfileHarnesses } from "./agentProfileHarnesses";

/**
 * "Add profile" in Agents · General. The dialog creates the profile on the
 * selected machine's host through the same host-scoped service the provider
 * pages use, then opens the new profile's settings page.
 */
export function AgentProfileAddButton(props: {
  machine: MachineDescriptor;
  onOpenAgentSettings: (kind: string) => void;
}) {
  const agentHost = agentManagementHostForMachine(props.machine);
  const canWrite = useRemoteHostCanWrite(agentHost.connectionKey);
  const terminalAccess = useRemoteHostTerminalAccess(agentHost.connectionKey);
  const statusPools = useHostAgentStatusPools(agentHost.connectionKey);
  const env = props.machine.ref.env;
  const statuses =
    env.kind === "wsl"
      ? statusPools.wsl.filter((status) => status.envDistro === env.distro)
      : statusPools.windows;
  const projects = useAppStore((state) => state.projects);
  const machineProject = findProjectForMachine(props.machine, projects, isWindows(), statuses, {
    allowHomeWithoutProject: true,
  });
  const settingsHost = createAgentSettingsHost({
    host: agentHost,
    isOnline: props.machine.status === "online",
    canWrite,
    ...terminalAccess,
    ...(machineProject ? { machineProject } : {}),
    machineLabel: props.machine.label,
    wslDistros: env.kind === "wsl" ? [env.distro] : [],
  });
  return (
    <AgentSettingsHostProvider host={settingsHost}>
      <AgentProfileAddButtonBody
        hostLabel={props.machine.label}
        statuses={statuses}
        workspaceIsClientDevice={props.machine.kind === "local" && !isRemoteSession()}
        onOpenAgentSettings={props.onOpenAgentSettings}
      />
    </AgentSettingsHostProvider>
  );
}

function AgentProfileAddButtonBody(props: {
  hostLabel: string;
  statuses: readonly AgentStatus[];
  workspaceIsClientDevice: boolean;
  onOpenAgentSettings: (kind: string) => void;
}) {
  const settingsHost = useAgentSettingsHost();
  const agentInstances = useHostAgentInstances();
  const harnesses = agentProfileHarnesses();
  const [isOpen, setIsOpen] = useState(false);
  if (harnesses.length === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 min-h-7 gap-1 px-2 text-[11px]"
        isDisabled={
          !settingsHost.isOnline || !settingsHost.canManageProfiles || !settingsHost.canWrite
        }
        onPress={() => setIsOpen(true)}
      >
        <Plus className="size-3" />
        <Trans>Add profile</Trans>
      </Button>
      {isOpen ? (
        <AgentProfileDialog
          harnesses={harnesses}
          initialDriver={harnesses[0]?.driver ?? ""}
          settingsHost={settingsHost}
          agentInstances={agentInstances}
          statuses={props.statuses}
          hostLabel={props.hostLabel}
          workspaceIsClientDevice={props.workspaceIsClientDevice}
          onDismiss={() => setIsOpen(false)}
          onCreated={(kind) => {
            void refreshAgentProfiles(settingsHost, kind)
              .then(() => props.onOpenAgentSettings(kind))
              .catch((error) => toast.danger(friendlyError(error)));
          }}
        />
      ) : null}
    </>
  );
}
