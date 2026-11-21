import { useLingui } from "@lingui/react/macro";
import { Monitor } from "lucide-react";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { isRemoteSession } from "@/renderer/bridge";
import { Select } from "@/renderer/components/common";
import { useMachineScopeTriggerClass } from "@/renderer/components/machineScope/MachineSelect";
import { ProjectRemoteServerIcon } from "@/renderer/components/common/ProjectRemoteServer";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export const LOCAL_ARCHIVE_MACHINE_ID = "local";

export interface ArchivedThreadsScopeProps {
  machineId: string;
  onMachineChange: (machineId: string) => void;
}

export function useArchivedThreadsMachine(machineId: string) {
  const { t } = useLingui();
  const remoteSession = isRemoteSession();
  const servers = useRemoteServersStore((state) => state.servers);
  const runtime = useRemoteServersStore((state) => state.runtime);
  const options = [
    ...(!remoteSession
      ? [
          {
            id: LOCAL_ARCHIVE_MACHINE_ID,
            label: t`This machine`,
            icon: <Monitor className="size-4" />,
          },
        ]
      : []),
    ...servers.map((server) => ({
      id: remoteConnectionKey(server),
      label: desktopTitle(server.label),
      icon: (
        <ProjectRemoteServerIcon
          info={{
            isRemote: true,
            serverName: desktopTitle(server.label),
            status: runtime[remoteConnectionKey(server)]?.status,
          }}
          className="size-3.5 text-muted"
          dotClassName="size-1"
        />
      ),
    })),
  ];
  const selectedMachine = options.find((option) => option.id === machineId) ?? options[0];
  const server = servers.find(
    (candidate) => remoteConnectionKey(candidate) === selectedMachine?.id,
  );
  const unavailable =
    !selectedMachine ||
    (selectedMachine.id !== LOCAL_ARCHIVE_MACHINE_ID &&
      runtime[selectedMachine.id]?.status !== "online" &&
      runtime[selectedMachine.id]?.status !== "error");
  const canOperate =
    !unavailable && (!remoteSession || server?.scopes.includes("session:operate") === true);
  return { options, selectedMachine, unavailable, canOperate, remoteSession };
}

export function ArchivedThreadsMachinePicker(props: ArchivedThreadsScopeProps) {
  const { t } = useLingui();
  const { options, selectedMachine } = useArchivedThreadsMachine(props.machineId);
  const triggerClassName = useMachineScopeTriggerClass();
  if (options.length <= 1 || !selectedMachine) return null;
  return (
    <Select
      aria-label={`${t`Machine`}: ${selectedMachine.label}`}
      className="max-w-56 shrink-0"
      {...(triggerClassName ? { triggerClassName } : {})}
      options={options}
      value={selectedMachine.id}
      onChange={props.onMachineChange}
    />
  );
}
