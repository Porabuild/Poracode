import { chooseMachine, useMachines, type MachineDescriptor } from "@/renderer/state/machines";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { LOCAL_NATIVE_MACHINE_KEY, machineKey } from "@/shared/machines";
import { FloatingScopeBar } from "./FloatingScopeBar";
import { MachineSelect } from "./MachineSelect";

/** One entry per host: WSL distros share their host's settings. */
function useHosts(): MachineDescriptor[] {
  return useMachines().filter((machine) => machine.ref.env.kind === "native");
}

/**
 * Host scope for a remote client's host-backed settings pages. The bridge
 * host is always the local entry; choosing another host rebinds the bridge, so
 * the page remounts against that host's settings.
 */
export function SettingsHostBar() {
  const hosts = useHosts();
  if (hosts.length <= 1) return null;
  return (
    <FloatingScopeBar>
      <MachineSelect machines={hosts} value={LOCAL_NATIVE_MACHINE_KEY} onChange={chooseMachine} />
    </FloatingScopeBar>
  );
}

/** Host scope for the desktop's Provider Usage page, shared with the Usage panel. */
export function UsageHostBar() {
  const hosts = useHosts();
  const desktopId = useUsageScopeStore((state) => state.desktopId);
  const setDesktopId = useUsageScopeStore((state) => state.setDesktopId);
  if (hosts.length <= 1) return null;
  return (
    <FloatingScopeBar>
      <MachineSelect
        machines={hosts}
        value={
          desktopId === null
            ? LOCAL_NATIVE_MACHINE_KEY
            : machineKey({ host: "remote", desktopId, env: { kind: "native" } })
        }
        onChange={(machine) =>
          setDesktopId(machine.ref.host === "remote" ? machine.ref.desktopId : null)
        }
      />
    </FloatingScopeBar>
  );
}
