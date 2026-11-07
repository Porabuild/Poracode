import { Monitor } from "lucide-react";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { RemoteServerIcon } from "./RemoteServerIcon";
import { TuxIcon } from "./TuxIcon";

/** Machine glyph shared by every machine picker: local, WSL distro, or paired host with status. */
export function MachineIcon(props: { machine: MachineDescriptor; className?: string }) {
  const { machine } = props;
  const size = props.className ?? "size-3.5";
  // A remote client's local entry is a paired host, so it keeps the server icon.
  if (machine.kind === "local" && machine.desktopId === undefined) {
    return <Monitor className={`${size} shrink-0 text-muted`} />;
  }
  if (machine.kind === "local-wsl") return <TuxIcon className={`${size} shrink-0 text-muted`} />;
  return (
    <RemoteServerIcon
      status={machine.status}
      className={`${size} text-muted`}
      dotClassName="size-1.5"
    />
  );
}

/**
 * The option label. Local WSL distros drop the "WSL · " prefix because the Tux
 * icon already says so; everywhere else the shared machine label is used.
 */
export function machineOptionLabel(machine: MachineDescriptor): string {
  return machine.kind === "local-wsl" && machine.wslDistro ? machine.wslDistro : machine.label;
}
