import type { Project } from "@/shared/contracts";
import { agentEnvForLocation, parseMachineKey } from "@/shared/machines";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { projectEnvironmentKey } from "@/renderer/state/projectGroups/projectGroups";
import { useProjectGroup } from "@/renderer/state/projectGroups/useProjectGroups";
import { projectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import { MachineIcon, machineOptionLabel } from "./MachineIcon";
import { type ProjectRemoteServerInfo, useProjectRemoteServerLookup } from "./ProjectRemoteServer";

/** One environment of a logical project, described like any other machine. */
export interface ProjectEnvironmentMachine {
  readonly machine: MachineDescriptor;
  readonly project: Project;
}

/**
 * Picker status of a project's machine. A paired machine reporting a
 * non-transport `error` is still reachable for its projects (see
 * `reachability.ts`), so it stays selectable here; the Agents machine list
 * maps it differently because there it means no agent status arrived.
 */
function machineStatus(remote: ProjectRemoteServerInfo): MachineDescriptor["status"] {
  if (!remote.isRemote || remote.status === "online" || remote.status === "error") return "online";
  return remote.status === "connecting" ? "connecting" : "offline";
}

/** A project row's environment as a machine descriptor, for the shared machine pickers. */
function projectEnvironmentMachine(
  project: Project,
  remote: ProjectRemoteServerInfo,
): MachineDescriptor | undefined {
  const id = projectEnvironmentKey(project);
  const ref = parseMachineKey(id);
  if (!ref) return undefined;
  const env = agentEnvForLocation(project.location);
  const wsl = env.kind === "wsl";
  return {
    id,
    ref,
    kind: ref.host === "local" ? (wsl ? "local-wsl" : "local") : wsl ? "remote-wsl" : "remote",
    label: projectEnvironmentLabel(project, remote.serverName),
    status: machineStatus(remote),
    ...(ref.host === "remote" ? { desktopId: ref.desktopId } : {}),
    ...(wsl ? { wslDistro: env.distro } : {}),
  };
}

/** Lookup form for list surfaces; one subscription for many rows. */
export function useProjectEnvironmentMachineLookup(): (
  project: Project,
) => ProjectEnvironmentMachine | undefined {
  const remoteServerFor = useProjectRemoteServerLookup();
  return (project) => {
    const machine = projectEnvironmentMachine(project, remoteServerFor(project));
    return machine ? { machine, project } : undefined;
  };
}

/**
 * Every environment of the logical project holding `projectId`, local first.
 * Empty while the project lives on a single environment, so callers render
 * nothing — single-environment users see the pre-grouping surfaces.
 */
export function useProjectEnvironmentMachines(
  projectId: string | undefined,
): readonly ProjectEnvironmentMachine[] {
  const members = useProjectGroup(projectId)?.members ?? [];
  const machineFor = useProjectEnvironmentMachineLookup();
  if (members.length < 2) return [];
  return members.flatMap((member) => {
    const entry = machineFor(member);
    return entry ? [entry] : [];
  });
}

/**
 * Machines a logical project lives on, for a list row: each machine's glyph
 * and short name ("Local", "Ubuntu", "MacBook"), so two paired machines stay
 * distinguishable. Takes the list's lookup instead of subscribing per row.
 */
export function ProjectEnvironmentGlyphs(props: {
  members: readonly Project[];
  machineFor: (project: Project) => ProjectEnvironmentMachine | undefined;
  className?: string | undefined;
}) {
  if (props.members.length < 2) return null;
  const machines = props.members.flatMap((member) => {
    const entry = props.machineFor(member);
    return entry ? [entry.machine] : [];
  });
  const labels = machines.map(machineOptionLabel);
  return (
    <span
      className={`inline-flex min-w-0 shrink items-center gap-1.5 text-[11px] text-muted/70 ${props.className ?? ""}`}
      title={labels.join(", ")}
      data-project-environments=""
    >
      {machines.map((machine, index) => (
        <span key={machine.id} className="inline-flex min-w-0 items-center gap-1">
          <MachineIcon machine={machine} className="size-3" />
          <span className="truncate">{labels[index]}</span>
        </span>
      ))}
    </span>
  );
}
