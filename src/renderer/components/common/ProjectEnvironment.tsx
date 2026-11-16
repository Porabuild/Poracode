import { useContext, useEffect, useRef, useState } from "react";
import { Description, Tooltip } from "@heroui/react";
import { useFocusVisible } from "react-aria";
import { TextContext } from "react-aria-components";
import type { Project } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { agentEnvForLocation, parseMachineKey } from "@/shared/machines";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { projectEnvironmentKey } from "@/renderer/state/projectGroups/projectGroups";
import { useProjectGroup } from "@/renderer/state/projectGroups/useProjectGroups";
import { projectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import { MachineIcon, machineOptionLabel } from "./MachineIcon";
import { RemoteServerIcon } from "./RemoteServerIcon";
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
  // Home is a projectless OS session on every machine, not one logical project
  // whose settings span environments.
  if (isHomeProjectId(projectId)) return [];
  if (members.length < 2) return [];
  return members.flatMap((member) => {
    const entry = machineFor(member);
    return entry ? [entry] : [];
  });
}

/** One compact connection marker; machine names and paths live in its tooltip. */
export function ProjectEnvironmentIndicator(props: {
  members: readonly Project[];
  machineFor: (project: Project) => ProjectEnvironmentMachine | undefined;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { isFocusVisible } = useFocusVisible();
  const textContext = useContext(TextContext);
  const describesItem =
    textContext != null &&
    "slots" in textContext &&
    textContext.slots?.label != null &&
    textContext.slots?.description != null;
  const entries = props.members.flatMap((project) => {
    const entry = props.machineFor(project);
    return entry ? [entry] : [];
  });
  const showDetails =
    entries.length > 0 && (entries.length > 1 || entries[0]!.machine.kind !== "local");
  const remoteMachines = entries
    .map((entry) => entry.machine)
    .filter((machine) => machine.ref.host === "remote");
  const remoteStatus = remoteMachines.some((machine) => machine.status === "online")
    ? "online"
    : remoteMachines.some((machine) => machine.status === "connecting")
      ? "connecting"
      : "offline";
  // Keyboard focus lands on the enclosing row — a menu item or button — not its informational icon.
  useEffect(() => {
    if (!showDetails) return;
    const row = wrapperRef.current?.closest('[data-slot="menu-item"], button');
    if (!row) return;
    const onFocus = () => {
      if (isFocusVisible && document.activeElement === row) setIsOpen(true);
    };
    const onBlur = () => setIsOpen(false);
    row.addEventListener("focusin", onFocus);
    row.addEventListener("focusout", onBlur);
    onFocus();
    return () => {
      row.removeEventListener("focusin", onFocus);
      row.removeEventListener("focusout", onBlur);
    };
  }, [showDetails, isFocusVisible]);
  if (!showDetails) return null;
  return (
    <span ref={wrapperRef} className="inline-flex shrink-0">
      {describesItem ? (
        <Description className="sr-only">
          {entries
            .map(
              ({ machine, project }) =>
                `${machineOptionLabel(machine)}: ${environmentPath(project)}`,
            )
            .join("; ")}
        </Description>
      ) : null}
      <Tooltip delay={500} isOpen={isOpen} onOpenChange={setIsOpen}>
        <Tooltip.Trigger
          className="shrink-0 text-muted/60"
          aria-label={entries.map(({ machine }) => machineOptionLabel(machine)).join(", ")}
          role="img"
          tabIndex={-1}
          data-project-connection=""
        >
          {remoteMachines.length > 0 ? (
            <RemoteServerIcon
              status={remoteStatus}
              className="size-2.5 text-muted/60"
              dotClassName="size-1"
            />
          ) : (
            <MachineIcon machine={entries[0]!.machine} className="size-2.5" />
          )}
        </Tooltip.Trigger>
        {/* Keep the tooltip accessible inside modal project picker popovers. */}
        <Tooltip.Content
          placement="right"
          className="max-w-80 text-xs"
          data-react-aria-top-layer=""
        >
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <ProjectEnvironmentDetail key={entry.machine.id} entry={entry} />
            ))}
          </div>
        </Tooltip.Content>
      </Tooltip>
    </span>
  );
}

function environmentPath(project: Project): string {
  return project.location.kind === "wsl" ? project.location.linuxPath : project.location.path;
}

function ProjectEnvironmentDetail(props: { entry: ProjectEnvironmentMachine }) {
  const { machine, project } = props.entry;
  return (
    <div className="flex items-start gap-2">
      <MachineIcon machine={machine} className="mt-0.5 size-3" />
      <div className="min-w-0">
        <div>{machineOptionLabel(machine)}</div>
        <div className="break-all text-muted">{environmentPath(project)}</div>
      </div>
    </div>
  );
}
