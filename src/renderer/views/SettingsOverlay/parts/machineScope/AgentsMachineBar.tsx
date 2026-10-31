import { useEffect } from "react";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import {
  chooseMachine,
  useLocalDistroOwner,
  useMachines,
  useWslDistroListStore,
} from "@/renderer/state/machines";
import { LOCAL_NATIVE_MACHINE_KEY } from "@/shared/machines";
import { FloatingScopeBar } from "./FloatingScopeBar";
import { MachineSelect } from "./MachineSelect";

/**
 * Global machine scope for the Agents settings area: a floating pill docked
 * at the bottom-center of the page, clear of the content flow. Renders
 * nothing while only the local machine exists, so single-machine users see
 * the pages exactly as before.
 */
export function AgentsMachineBar() {
  const machines = useMachines();
  const selectedMachineId = useMachineSelectionStore((state) => state.selectedMachineId);
  const setSelectedMachine = useMachineSelectionStore((state) => state.setSelectedMachine);
  const distroOwner = useLocalDistroOwner();
  const distrosLoadedFor = useWslDistroListStore((state) => state.loadedFor);
  const refreshDistros = useWslDistroListStore((state) => state.refresh);

  // Enumerate local WSL distros once per settings visit and again after a
  // remote client moves to another host (registry probe on the supervisor).
  // Project-derived distros keep the list useful if this fails.
  useEffect(() => {
    if (distroOwner !== null && distrosLoadedFor !== distroOwner) void refreshDistros(distroOwner);
  }, [distroOwner, distrosLoadedFor, refreshDistros]);

  // Snap back to the local machine when the selection disappears (distro
  // removed, server unpaired).
  useEffect(() => {
    if (!machines.some((machine) => machine.id === selectedMachineId)) {
      setSelectedMachine(LOCAL_NATIVE_MACHINE_KEY);
    }
  }, [machines, selectedMachineId, setSelectedMachine]);

  if (machines.length <= 1) return null;

  return (
    <FloatingScopeBar>
      <MachineSelect machines={machines} value={selectedMachineId} onChange={chooseMachine} />
    </FloatingScopeBar>
  );
}
