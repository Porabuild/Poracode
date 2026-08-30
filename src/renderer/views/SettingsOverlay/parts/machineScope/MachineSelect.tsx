import { useLingui } from "@lingui/react/macro";
import { Monitor, Server } from "lucide-react";
import { Select, TuxIcon, type SelectOption } from "@/renderer/components/common";
import { RemoteServerStatusDot } from "@/renderer/components/common/RemoteServerStatusDot";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import type { MachineDescriptor } from "@/renderer/state/machines";

/** Pseudo-option id intercepted to open the Remote Environments page. */
const PAIR_REMOTE_OPTION_ID = "__pair-remote";

function machineIcon(machine: MachineDescriptor) {
  if (machine.kind === "local") return <Monitor className="size-3.5 shrink-0 text-muted" />;
  if (machine.kind === "local-wsl") return <TuxIcon className="size-3.5 shrink-0 text-muted" />;
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <Server className="size-3.5 text-muted" />
      <RemoteServerStatusDot
        status={
          machine.status === "online"
            ? "online"
            : machine.status === "connecting"
              ? "connecting"
              : "offline"
        }
        className="absolute -bottom-0.5 -right-0.5"
        sizeClassName="size-1.5"
      />
    </span>
  );
}

export function MachineSelect(props: {
  machines: readonly MachineDescriptor[];
  onPairRemote: () => void;
}) {
  const { t } = useLingui();
  const selectedMachineId = useMachineSelectionStore((state) => state.selectedMachineId);
  const setSelectedMachine = useMachineSelectionStore((state) => state.setSelectedMachine);

  const machineDetail = (machine: MachineDescriptor): string | undefined =>
    machine.status === "connecting" ? t`Connecting…` : undefined;

  const options: SelectOption[] = [
    ...props.machines.map((machine) => {
      const detail = machineDetail(machine);
      return {
        id: machine.id,
        label: machine.label,
        icon: machineIcon(machine),
        ...(detail ? { detail } : {}),
        // An offline machine has nothing to scope to, so it stays listed (its
        // status dot says why) but unselectable instead of carrying a caption.
        ...(machine.status === "offline" ? { isDisabled: true } : {}),
      };
    }),
    {
      id: PAIR_REMOTE_OPTION_ID,
      label: t`Pair a remote machine…`,
      icon: <Server className="size-3.5 shrink-0 text-muted" />,
    },
  ];

  return (
    <Select
      aria-label={t`Select machine`}
      className="w-[220px] shrink-0"
      options={options}
      value={selectedMachineId}
      onChange={(value) => {
        if (value === PAIR_REMOTE_OPTION_ID) {
          props.onPairRemote();
          return;
        }
        setSelectedMachine(value);
      }}
    />
  );
}
