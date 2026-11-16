import { useState } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, ChevronUp } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { MachineIcon, machineOptionLabel } from "@/renderer/components/common/MachineIcon";
import { ProjectEnvironmentIndicator } from "@/renderer/components/common/ProjectEnvironment";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";
import { type MachineControl, useGitHubActionsProjectPicker } from "./gitHubActionsProjects";

/** Same glass pill for both controls, so the pair reads as one row of equal selectors. */
const pillClass = "m-floating-selector pointer-events-auto px-4 text-sm";

/**
 * One width for every machine, so the pill never resizes with the selection;
 * on narrow phones it is capped to leave the project name room. The cap needs
 * `!` because the compact `.m-floating-selector` rule sets its own max-width.
 */
const machinePillClass = "w-40 !max-w-[45%] shrink-0";

/**
 * Compact layout's floating project and machine selectors, side by side. The
 * machine pill follows the sidebar's rules: reserved once any project lives
 * somewhere other than this computer alone, a label on one machine, a toggle
 * between two, and a bottom sheet from three on.
 */
export function GitHubActionsMobileProjectBar(props: {
  projects: readonly Project[];
  selectedProject: Project;
  onSelectProject: (projectId: string) => void;
}) {
  const { t } = useLingui();
  const { selectedProject } = props;
  const [projectsOpen, setProjectsOpen] = useState(false);
  const picker = useGitHubActionsProjectPicker(
    props.projects,
    selectedProject.id,
    props.onSelectProject,
  );
  const remoteServerFor = useProjectRemoteServerLookup();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 flex justify-center gap-2 px-4">
      <ResponsiveMenuSurface
        isOpen={projectsOpen}
        onOpenChange={setProjectsOpen}
        label={t`Project`}
        trigger={
          <Button
            variant="ghost"
            // Beside the machine pill it fills the row, so neither pill moves
            // when a project with a longer or shorter name is picked.
            className={`${pillClass} min-w-0 justify-start ${picker.showMachineSlot ? "flex-1" : ""}`}
            aria-label={t`Project`}
            aria-expanded={projectsOpen}
            onPress={() => setProjectsOpen(true)}
          >
            <ProjectSelectorIcon
              project={selectedProject}
              remote={remoteServerFor(selectedProject)}
              showEnvironment={false}
            />
            <span className="min-w-0 truncate font-medium">{selectedProject.name}</span>
            <ChevronUp className="ms-auto size-4 shrink-0 text-muted" />
          </Button>
        }
      >
        <div className="m-sheet-list">
          {picker.entries.map((entry) => {
            const project = picker.entryProject(entry);
            const selected = entry === picker.currentEntry;
            return (
              <button
                key={entry.id}
                type="button"
                className="m-sheet-action"
                aria-pressed={selected || undefined}
                onClick={() => {
                  setProjectsOpen(false);
                  picker.selectProject(entry);
                }}
              >
                <ProjectSelectorIcon
                  project={project}
                  remote={remoteServerFor(project)}
                  showEnvironment={false}
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <ProjectEnvironmentIndicator
                  members={entry.members}
                  machineFor={picker.machineFor}
                />
                {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      </ResponsiveMenuSurface>

      {picker.showMachineSlot ? (
        <MachinePill control={picker.machine} onSelect={picker.selectMachine} />
      ) : null}
    </div>
  );
}

function MachinePill(props: {
  control: MachineControl | undefined;
  onSelect: (projectId: string) => void;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const { control } = props;
  if (!control) return <span aria-hidden className={machinePillClass} />;

  const currentLabel = machineOptionLabel(control.current.machine);
  const content = (
    <>
      <MachineIcon machine={control.current.machine} className="size-4" />
      <span className="min-w-0 flex-1 truncate text-start font-medium">{currentLabel}</span>
      {control.kind === "label" ? null : <ChevronUp className="size-4 shrink-0 text-muted" />}
    </>
  );

  if (control.kind === "label") {
    return (
      <span
        className={`${pillClass} ${machinePillClass} inline-flex items-center gap-2`}
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
      className={`${pillClass} ${machinePillClass}`}
      aria-label={t`Machine: ${currentLabel}`}
      {...(toggleTarget ? {} : { "aria-expanded": isOpen })}
      onPress={() => (toggleTarget ? props.onSelect(toggleTarget) : setIsOpen(true))}
    >
      {content}
    </Button>
  );
  if (control.kind === "toggle") return trigger;

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      label={t`Select machine`}
      trigger={trigger}
    >
      <div className="m-sheet-list">
        {control.machines.map((entry) => {
          const selected = entry === control.current;
          return (
            <button
              key={entry.project.id}
              type="button"
              className="m-sheet-action"
              aria-pressed={selected || undefined}
              onClick={() => {
                setIsOpen(false);
                props.onSelect(entry.project.id);
              }}
            >
              <MachineIcon machine={entry.machine} />
              <span className="min-w-0 flex-1 truncate">{machineOptionLabel(entry.machine)}</span>
              {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </ResponsiveMenuSurface>
  );
}
