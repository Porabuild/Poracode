import type { Project } from "@/shared/contracts";
import {
  type ProjectEnvironmentMachine,
  useProjectEnvironmentMachineLookup,
} from "@/renderer/components/common/ProjectEnvironment";
import { compareProjectSelectorOrder } from "@/renderer/components/thread/projectSwitchGroups";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import {
  groupProjectRows,
  type ProjectGroupRow,
} from "@/renderer/state/projectGroups/projectGroups";
import {
  pickGroupMember,
  useProjectGroupIndex,
} from "@/renderer/state/projectGroups/useProjectGroups";

/**
 * The open project's machine control: a plain label on one machine, a toggle
 * between two, and a menu from three on.
 */
export type MachineControl =
  | { readonly kind: "label"; readonly current: ProjectEnvironmentMachine }
  | {
      readonly kind: "toggle";
      readonly current: ProjectEnvironmentMachine;
      readonly next: ProjectEnvironmentMachine;
    }
  | {
      readonly kind: "menu";
      readonly current: ProjectEnvironmentMachine;
      readonly machines: readonly ProjectEnvironmentMachine[];
    };

type MachineLookup = (project: Project) => ProjectEnvironmentMachine | undefined;

/** Machines an entry's project can be opened on, in machine-list order (Local, WSL, paired). */
function entryMachines(
  entry: ProjectGroupRow,
  machineFor: MachineLookup,
): ProjectEnvironmentMachine[] {
  return entry.members.flatMap((member) => {
    const machine = machineFor(member);
    return machine ? [machine] : [];
  });
}

function machineControl(
  machines: readonly ProjectEnvironmentMachine[],
  selectedProjectId: string,
): MachineControl | undefined {
  const current = machines.find((entry) => entry.project.id === selectedProjectId);
  if (!current) return undefined;
  if (machines.length === 1) return { kind: "label", current };
  if (machines.length === 2) {
    return { kind: "toggle", current, next: machines.find((entry) => entry !== current)! };
  }
  return { kind: "menu", current, machines };
}

/**
 * Project and machine selection shared by the sidebar and the compact layout.
 *
 * One entry per logical project: the same repository on this computer, a WSL
 * distro and paired machines is a single row, like the composer's project
 * switcher. Members are only the copies this view can open (enabled, on a
 * reachable machine), so every machine offered is available.
 */
export function useGitHubActionsProjectPicker(
  projects: readonly Project[],
  selectedProjectId: string,
  onSelectProject: (projectId: string) => void,
) {
  const index = useProjectGroupIndex();
  const machineFor = useProjectEnvironmentMachineLookup();
  const entries = groupProjectRows(projects.toSorted(compareProjectSelectorOrder), index);
  const currentEntry = entries.find((entry) =>
    entry.members.some((member) => member.id === selectedProjectId),
  );

  function open(projectId: string) {
    useProjectGroupStore.getState().markProjectUsed(projectId);
    onSelectProject(projectId);
  }

  return {
    entries,
    currentEntry,
    machineFor,
    /**
     * Shown once any listed project lives somewhere other than this computer
     * alone. While it is, every project keeps the slot, so switching projects
     * or machines never shifts the row.
     */
    showMachineSlot: entries.some((entry) => {
      const machines = entryMachines(entry, machineFor);
      return machines.length > 1 || machines.some(({ machine }) => machine.kind !== "local");
    }),
    machine: currentEntry
      ? machineControl(entryMachines(currentEntry, machineFor), selectedProjectId)
      : undefined,
    /** The copy shown for an entry: the open one, else the first. */
    entryProject: (entry: ProjectGroupRow): Project =>
      entry.members.find((member) => member.id === selectedProjectId) ?? entry.members[0]!,
    /**
     * Opens a logical project on the machine this client used most recently,
     * else the first one. Picking the open entry keeps its machine.
     */
    selectProject(entry: ProjectGroupRow) {
      if (entry === currentEntry) return;
      open(pickGroupMember(entry.members, () => true)!.id);
    },
    /** Opens the open project's copy on another machine and remembers that machine. */
    selectMachine(projectId: string) {
      if (projectId !== selectedProjectId) open(projectId);
    },
  };
}
