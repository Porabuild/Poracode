import { ChevronDown, Monitor } from "lucide-react";
import { Button, Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TuxIcon } from "@/renderer/components/common";
import { RemoteServerIcon } from "@/renderer/components/common/RemoteServerIcon";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  MACHINE_RUNTIME_PREFIX,
  machineConnectionKey,
  useMachineName,
  type ProjectMachine,
} from "./projectMachines";

/**
 * Where the create and clone dialogs put a new project: this computer
 * ("native"), one of its WSL distros, or a reachable paired machine. The keys
 * follow {@link machineConnectionKey}.
 */
export function ProjectRuntimePicker(props: {
  readonly runtimeKey: string;
  readonly distros: readonly string[];
  readonly machines: readonly ProjectMachine[];
  readonly onChange: (runtimeKey: string) => void;
}) {
  const { t } = useLingui();
  const machineKey = machineConnectionKey(props.runtimeKey);
  const machine = useMachineName(machineKey);
  const machineStatus = useRemoteServersStore((state) =>
    machineKey ? state.runtime[machineKey]?.status : undefined,
  );
  const localLabel = localEnvLabel({ kind: "native" });
  const label = machine ?? (props.runtimeKey === "native" ? localLabel : props.runtimeKey);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted">
        <Trans>Runtime</Trans>
      </Label>
      <Dropdown>
        <Button aria-label={t`Runtime`} variant="tertiary" className="justify-between">
          <span className="flex items-center gap-2">
            {machineKey ? (
              <RemoteServerIcon status={machineStatus ?? "offline"} />
            ) : props.runtimeKey === "native" ? (
              <Monitor className="size-4 text-muted" />
            ) : (
              <TuxIcon className="size-4 text-muted" />
            )}
            {label}
          </span>
          <ChevronDown className="size-3.5 text-muted/60" />
        </Button>
        <Dropdown.Popover className="min-w-[--trigger-width]">
          <Dropdown.Menu
            aria-label={t`Runtime options`}
            selectionMode="single"
            selectedKeys={[props.runtimeKey]}
            onAction={(key) => props.onChange(String(key))}
          >
            <Dropdown.Item id="native" textValue={localLabel}>
              <Monitor className="size-4 shrink-0 text-muted" />
              <Label>{localLabel}</Label>
            </Dropdown.Item>
            {props.distros.map((distro) => (
              <Dropdown.Item key={distro} id={distro} textValue={distro}>
                <TuxIcon className="size-4 shrink-0 text-muted" />
                <Label>{distro}</Label>
              </Dropdown.Item>
            ))}
            {props.machines.length > 0 ? <Separator /> : null}
            {props.machines.map((option) => (
              <Dropdown.Item
                key={option.connectionKey}
                id={`${MACHINE_RUNTIME_PREFIX}${option.connectionKey}`}
                textValue={option.label}
              >
                <RemoteServerIcon status={option.status} />
                <Label>{option.label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
