import { useLingui } from "@lingui/react/macro";
import { Select, type SelectOption } from "@/renderer/components/common";
import { MachineIcon, machineOptionLabel } from "@/renderer/components/common/MachineIcon";
import type { MachineDescriptor } from "@/renderer/state/machines";

export function MachineSelect(props: {
  machines: readonly MachineDescriptor[];
  value: string;
  onChange: (machine: MachineDescriptor) => void;
}) {
  const { t } = useLingui();

  const machineDetail = (machine: MachineDescriptor): string | undefined =>
    machine.status === "connecting" ? t`Connecting…` : undefined;

  const options: SelectOption[] = props.machines.map((machine) => {
    const detail = machineDetail(machine);
    return {
      id: machine.id,
      label: machineOptionLabel(machine),
      icon: <MachineIcon machine={machine} />,
      ...(detail ? { detail } : {}),
      // An offline machine has nothing to scope to, so it stays listed (its
      // status dot says why) but unselectable instead of carrying a caption.
      ...(machine.status === "offline" ? { isDisabled: true } : {}),
    };
  });

  return (
    <Select
      aria-label={t`Select machine`}
      className="w-[220px] shrink-0"
      options={options}
      value={props.value}
      onChange={(id) => {
        const machine = props.machines.find((candidate) => candidate.id === id);
        if (machine) props.onChange(machine);
      }}
    />
  );
}
