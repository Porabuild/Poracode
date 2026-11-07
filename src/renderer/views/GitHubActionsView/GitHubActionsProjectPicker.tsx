import { Button, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronsUpDown } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { MachineIcon, machineOptionLabel } from "@/renderer/components/common/MachineIcon";
import { ProjectEnvironmentIndicator } from "@/renderer/components/common/ProjectEnvironment";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { type MachineControl, useGitHubActionsProjectPicker } from "./gitHubActionsProjects";

/** Shared by the project and machine controls so the pair reads as one row of equal controls. */
const pickerTriggerClass = "h-8 justify-start gap-2 rounded-3xl px-2 text-sm text-muted";

/**
 * The machine slot keeps one width for every project and machine, so neither
 * control moves when the selection changes; longer machine names truncate.
 */
const machineSlotClass = "w-36 shrink-0";

/**
 * The sidebar's project and machine pickers, side by side. In a sidebar too
 * narrow for both, the machine slot wraps below instead of squeezing the
 * project name away.
 */
export function GitHubActionsProjectPicker(props: {
  projects: readonly Project[];
  selectedProject: Project;
  onSelectProject: (projectId: string) => void;
}) {
  const { t } = useLingui();
  const { selectedProject } = props;
  const picker = useGitHubActionsProjectPicker(
    props.projects,
    selectedProject.id,
    props.onSelectProject,
  );
  const remoteServerFor = useProjectRemoteServerLookup();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Dropdown>
        <Button
          variant="ghost"
          size="sm"
          className={`${pickerTriggerClass} min-w-32 flex-1`}
          aria-label={t`Project`}
        >
          <ProjectSelectorIcon
            project={selectedProject}
            remote={remoteServerFor(selectedProject)}
            showEnvironment={false}
          />
          <span className="min-w-0 truncate">{selectedProject.name}</span>
          <ChevronsUpDown className="ms-auto size-3.5 shrink-0" />
        </Button>
        <Dropdown.Popover placement="bottom start" className="min-w-[--trigger-width]">
          <Dropdown.Menu
            aria-label={t`Project`}
            className="poracode-menu"
            selectionMode="single"
            selectedKeys={picker.currentEntry ? [picker.currentEntry.id] : []}
            onAction={(key) => {
              const entry = picker.entries.find((candidate) => candidate.id === String(key));
              if (entry) picker.selectProject(entry);
            }}
          >
            {picker.entries.map((entry) => {
              const project = picker.entryProject(entry);
              return (
                <Dropdown.Item key={entry.id} id={entry.id} textValue={project.name}>
                  <ProjectSelectorIcon
                    project={project}
                    remote={remoteServerFor(project)}
                    showEnvironment={false}
                  />
                  <Label className="min-w-0 flex-1 truncate">{project.name}</Label>
                  <ProjectEnvironmentIndicator
                    members={entry.members}
                    machineFor={picker.machineFor}
                  />
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      {picker.showMachineSlot ? (
        <MachineSlot control={picker.machine} onSelect={picker.selectMachine} />
      ) : null}
    </div>
  );
}

/**
 * One machine: a label. Two: the same control as the menu, switching to the
 * other machine on press. Three or more: a menu of the available machines.
 */
function MachineSlot(props: {
  control: MachineControl | undefined;
  onSelect: (projectId: string) => void;
}) {
  const { t } = useLingui();
  const { control } = props;
  if (!control) return <span aria-hidden className={machineSlotClass} />;

  const currentLabel = machineOptionLabel(control.current.machine);
  const content = (
    <>
      <MachineIcon machine={control.current.machine} className="size-4" />
      <span className="min-w-0 flex-1 truncate text-start">{currentLabel}</span>
      {control.kind === "label" ? null : <ChevronsUpDown className="size-3.5 shrink-0" />}
    </>
  );

  if (control.kind === "label") {
    return (
      <span
        className={`flex items-center ${pickerTriggerClass} ${machineSlotClass}`}
        data-project-environment=""
      >
        {content}
      </span>
    );
  }

  const toggleTarget = control.kind === "toggle" ? control.next.project.id : undefined;
  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className={`${pickerTriggerClass} ${machineSlotClass}`}
      aria-label={t`Machine: ${currentLabel}`}
      {...(toggleTarget ? { onPress: () => props.onSelect(toggleTarget) } : {})}
    >
      {content}
    </Button>
  );
  if (control.kind === "toggle") return trigger;

  return (
    <Dropdown>
      {trigger}
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={t`Select machine`}
          className="poracode-menu min-w-48"
          selectionMode="single"
          selectedKeys={[control.current.project.id]}
          onAction={(key) => props.onSelect(String(key))}
        >
          {control.machines.map((entry) => {
            const label = machineOptionLabel(entry.machine);
            return (
              <Dropdown.Item key={entry.project.id} id={entry.project.id} textValue={label}>
                <MachineIcon machine={entry.machine} className="size-4" />
                <Label>{label}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
