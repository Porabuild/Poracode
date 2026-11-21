import { useLingui } from "@lingui/react/macro";
import { Select, type SelectOption } from "@/renderer/components/common";
import { useResponsiveMenu } from "@/renderer/components/common/ResponsiveMenuSurface";
import { floatingBubblePillClass } from "@/renderer/components/layout/floatingGlass";
import { MachineIcon, machineOptionLabel } from "@/renderer/components/common/MachineIcon";
import type { MachineDescriptor } from "@/renderer/state/machines";

/**
 * Trigger surface for a floating machine scope pill: the Usage panel's bubble,
 * sized to its label (`min-w-36` for a stable target, `max-w-56` on the root).
 * `pe-7` keeps the value clear of HeroUI's absolutely positioned indicator,
 * `py-0` cancels the field padding that fights the pill height, and the value
 * (`> span`, so no class-name escaping) inherits the pill's type scale rather
 * than the form field's.
 */
const machineScopeTriggerClass = `${floatingBubblePillClass} min-w-36 ps-2.5 pe-7 py-0 [&>span]:text-xs`;

/**
 * The floating pill treatment, except on the compact sheet surface, which
 * keeps the standard field sizing (`.m-field-picker` sets its own height).
 */
export function useMachineScopeTriggerClass(): string | undefined {
  const { mobile } = useResponsiveMenu();
  return mobile ? undefined : machineScopeTriggerClass;
}

export function MachineSelect(props: {
  machines: readonly MachineDescriptor[];
  value: string;
  onChange: (machine: MachineDescriptor) => void;
}) {
  const { t } = useLingui();
  const triggerClassName = useMachineScopeTriggerClass();
  const selectedMachine = props.machines.find((machine) => machine.id === props.value);

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
      aria-label={
        selectedMachine
          ? `${t`Select machine`}: ${machineOptionLabel(selectedMachine)}`
          : t`Select machine`
      }
      className="max-w-56 shrink-0"
      {...(triggerClassName ? { triggerClassName } : {})}
      options={options}
      value={props.value}
      onChange={(id) => {
        const machine = props.machines.find((candidate) => candidate.id === id);
        if (machine) props.onChange(machine);
      }}
    />
  );
}
