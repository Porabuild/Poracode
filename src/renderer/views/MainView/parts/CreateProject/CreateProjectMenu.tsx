import { useEffect, useState, type Key, type ReactNode } from "react";
import { FilePlus, FolderOpen, GitBranch, Monitor, Server } from "lucide-react";
import { Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TuxIcon } from "@/renderer/components/common";
import { RemoteServerIcon } from "@/renderer/components/common/RemoteServerIcon";
import { readBridge } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { usePanelStore } from "@/renderer/state/panelStore";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import {
  addExistingProject,
  type CreateProjectMode,
} from "@/renderer/actions/createProjectActions";
import { useProjectMachines } from "./projectMachines";

/** A menu choice: the two create modes plus "clone". */
export type AddProjectAction = CreateProjectMode | "clone" | "remote";

/** One environment "Add folder" can register a folder from. */
interface FolderTarget {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly open: () => void;
}

/**
 * The "+" dropdown for creating a project. Wraps a caller-provided trigger
 * (so it can sit in the sidebar header or the welcome screen). "Start from
 * scratch" opens the create-project modal; "Clone a repository" opens the clone
 * modal; "Add folder" goes straight to the system folder picker
 * when this computer is the only place to pick from, and otherwise lists every
 * environment: this computer, its WSL distros, and each reachable paired
 * machine, whose own folder browser picks the folder there. `onSelect` fires
 * before any action so callers can dismiss surrounding UI (e.g. the welcome
 * overlay).
 */
export function CreateProjectMenu(props: {
  children: ReactNode;
  onSelect?: (action: AddProjectAction) => void;
}) {
  const { t } = useLingui();
  const [wslDistros, setWslDistros] = useState<string[]>([]);
  const localBackend = hasClientCapability("localBackend");
  const machines = useProjectMachines();

  useEffect(() => {
    if (!localBackend) return;
    let active = true;
    void readBridge()
      .listWslDistros()
      .then((distros) => {
        if (active) setWslDistros(distros);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [localBackend]);

  const localTargets: FolderTarget[] = localBackend
    ? [
        {
          id: "existing:native",
          label: localEnvLabel({ kind: "native" }),
          icon: <Monitor className="size-4 shrink-0 text-muted" />,
          open: () => void addExistingProject({ kind: "native" }),
        },
        ...wslDistros.map((distro) => ({
          id: `existing:wsl:${distro}`,
          label: distro,
          icon: (
            <span className="relative size-4 shrink-0">
              <TuxIcon className="absolute left-1/2 top-1/2 h-3 w-6 -translate-x-1/2 -translate-y-1/2 text-muted" />
            </span>
          ),
          open: () => void addExistingProject({ kind: "wsl", distro }),
        })),
      ]
    : [];
  const machineTargets: FolderTarget[] = machines.map((machine) => ({
    id: `existing:machine:${machine.connectionKey}`,
    label: machine.label,
    icon: <RemoteServerIcon status={machine.status} />,
    open: () => usePanelStore.getState().openRemoteFolderPicker(machine.connectionKey),
  }));
  const folderTargets = [...localTargets, ...machineTargets];
  const soleTarget = folderTargets.length === 1 ? folderTargets[0] : undefined;

  const handleAction = (key: Key) => {
    const id = String(key);
    const target = folderTargets.find((candidate) => candidate.id === id);
    props.onSelect?.(target ? "existing" : (id as AddProjectAction));
    const panel = usePanelStore.getState();
    if (target) target.open();
    else if (id === "scratch") panel.openCreateProjectModal();
    else if (id === "clone") panel.openCloneProjectModal();
    else panel.openSettingsSection("remoteServers");
  };

  const existingLabel = t`Add folder`;
  const renderTarget = (target: FolderTarget) => (
    <Dropdown.Item key={target.id} id={target.id} textValue={target.label}>
      {target.icon}
      <Label>{target.label}</Label>
    </Dropdown.Item>
  );

  return (
    <Dropdown>
      {props.children}
      <Dropdown.Popover className="min-w-[270px]">
        <Dropdown.Menu aria-label={t`Add project options`} onAction={handleAction}>
          {localBackend ? (
            <>
              <Dropdown.Item id="scratch" textValue={t`New project`}>
                <FilePlus className="size-4 shrink-0 text-muted" />
                <Label>
                  <Trans>New project</Trans>
                </Label>
              </Dropdown.Item>
              <Dropdown.Item id="clone" textValue={t`Clone a repository`}>
                <GitBranch className="size-4 shrink-0 text-muted" />
                <Label>
                  <Trans>Clone a repository</Trans>
                </Label>
              </Dropdown.Item>
            </>
          ) : null}
          {soleTarget ? (
            <Dropdown.Item id={soleTarget.id} textValue={existingLabel}>
              <FolderOpen className="size-4 shrink-0 text-muted" />
              <Label>{existingLabel}</Label>
              {machineTargets.includes(soleTarget) ? (
                <span className="ml-auto text-xs text-muted">{soleTarget.label}</span>
              ) : null}
            </Dropdown.Item>
          ) : folderTargets.length > 1 ? (
            <Dropdown.SubmenuTrigger>
              <Dropdown.Item id="existing" textValue={existingLabel}>
                <FolderOpen className="size-4 shrink-0 text-muted" />
                <Label>{existingLabel}</Label>
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover className="min-w-[200px]">
                <Dropdown.Menu aria-label={existingLabel} onAction={handleAction}>
                  {localTargets.map(renderTarget)}
                  {localTargets.length > 0 && machineTargets.length > 0 ? <Separator /> : null}
                  {machineTargets.map(renderTarget)}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
          ) : null}
          <Dropdown.Item id="remote" textValue={t`Add remote connection`}>
            <Server className="size-4 shrink-0 text-muted" />
            <Label>
              <Trans>Add remote connection</Trans>
            </Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
