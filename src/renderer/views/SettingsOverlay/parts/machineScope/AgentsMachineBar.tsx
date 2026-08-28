import { useEffect } from "react";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import { useMachines, useWslDistroListStore } from "@/renderer/state/machines";
import { LOCAL_NATIVE_MACHINE_KEY } from "@/shared/machines";
import { MachineSelect } from "./MachineSelect";
import type { SettingsSection } from "../types";

/**
 * Global machine scope for the Agents settings area: a floating pill docked
 * at the bottom-center of the page, clear of the content flow. Renders
 * nothing while only the local machine exists, so single-machine users see
 * the pages exactly as before.
 */
export function AgentsMachineBar(props: { onNavigate: (section: SettingsSection) => void }) {
  const machines = useMachines();
  const selectedMachineId = useMachineSelectionStore((state) => state.selectedMachineId);
  const setSelectedMachine = useMachineSelectionStore((state) => state.setSelectedMachine);
  const distrosLoaded = useWslDistroListStore((state) => state.loaded);
  const refreshDistros = useWslDistroListStore((state) => state.refresh);

  // Enumerate local WSL distros once per settings visit (registry probe on the
  // supervisor). Project-derived distros keep the list useful if this fails.
  useEffect(() => {
    if (!distrosLoaded) void refreshDistros();
  }, [distrosLoaded, refreshDistros]);

  // Snap back to the local machine when the selection disappears (distro
  // removed, server unpaired).
  useEffect(() => {
    if (!machines.some((machine) => machine.id === selectedMachineId)) {
      setSelectedMachine(LOCAL_NATIVE_MACHINE_KEY);
    }
  }, [machines, selectedMachineId, setSelectedMachine]);

  if (machines.length <= 1) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-6">
      <div className="pointer-events-auto">
        <MachineSelect machines={machines} onPairRemote={() => props.onNavigate("remoteServers")} />
      </div>
    </div>
  );
}
