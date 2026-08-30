import { create } from "zustand";
import { LOCAL_NATIVE_MACHINE_KEY } from "@/shared/machines";

/**
 * Which machine the Agents settings area is currently scoped to. Session-only
 * by design: every launch starts back at the local machine, so a stale
 * selection can never silently point install/login actions at another host.
 */
interface MachineSelectionState {
  selectedMachineId: string;
  setSelectedMachine(machineId: string): void;
}

export const useMachineSelectionStore = create<MachineSelectionState>((set) => ({
  selectedMachineId: LOCAL_NATIVE_MACHINE_KEY,
  setSelectedMachine: (machineId) => set({ selectedMachineId: machineId }),
}));
