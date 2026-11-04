import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Description, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { isHomeProjectId } from "@/shared/homeScope";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useProjectGroup } from "@/renderer/state/projectGroups/useProjectGroups";
import { useWorkspaceProjectFilter } from "@/renderer/state/workspaceSelectors";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { MachineIcon, machineOptionLabel } from "@/renderer/components/common/MachineIcon";
import { useRemoteServerStatusLabel } from "@/renderer/components/common/RemoteServerStatusDot";
import {
  type ProjectEnvironmentMachine,
  useProjectEnvironmentMachineLookup,
} from "@/renderer/components/common/ProjectEnvironment";
import { switchDraftProject, type SwitchDraftProjectOptions } from "./switchDraftProject";

/**
 * Where the new thread runs: the machines (Local, WSL distros, paired hosts)
 * that have the current project in the active workspace, with the same
 * glyphs, labels and offline handling as the Settings machine picker. A
 * project on a single paired machine names it as a plain label; a project
 * that only lives here shows nothing, matching the pre-grouping composer.
 */
export function ProjectEnvironmentMenu(
  props: { currentProjectId: string } & SwitchDraftProjectOptions,
) {
  const { currentProjectId } = props;
  const { t } = useLingui();
  const group = useProjectGroup(isHomeProjectId(currentProjectId) ? undefined : currentProjectId);
  const isInWorkspace = useWorkspaceProjectFilter();
  const machineFor = useProjectEnvironmentMachineLookup();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);

  // Same membership as the project switcher: the active workspace's enabled
  // rows. The current row always stays, even if it is filed elsewhere.
  const environments = (group?.members ?? []).flatMap((member) => {
    const isCurrent = member.id === currentProjectId;
    if (!isCurrent && (member.disabled || !isInWorkspace(member))) return [];
    const entry = machineFor(member);
    return entry ? [entry] : [];
  });
  const current = environments.find((entry) => entry.project.id === currentProjectId);
  if (!current) return null;

  if (environments.length < 2) {
    if (current.machine.ref.host === "local") return null;
    return (
      <span
        className="inline-flex min-w-0 shrink items-center gap-1 px-1 py-0.5 text-sm leading-tight text-muted/60"
        data-project-environment=""
      >
        <MachineIcon machine={current.machine} className="size-3.5" />
        <span className="min-w-0 truncate">{current.machine.label}</span>
      </span>
    );
  }

  const isSelectable = (entry: ProjectEnvironmentMachine) => entry.machine.status !== "offline";
  const currentLabel = machineOptionLabel(current.machine);
  const triggerLabel = t`Machine: ${currentLabel}`;

  function select(projectIdToOpen: string) {
    const target = environments.find((entry) => entry.project.id === projectIdToOpen);
    if (!target || !isSelectable(target) || projectIdToOpen === currentProjectId) return;
    switchDraftProject(currentProjectId, projectIdToOpen, props);
  }

  const triggerContent = (
    <>
      <MachineIcon machine={current.machine} className="size-3.5" />
      <span className="min-w-0 truncate">{currentLabel}</span>
      <ChevronDown className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </>
  );
  // Same type scale and treatment as the project trigger beside it, so the
  // machine reads as a control rather than metadata.
  const triggerClass =
    "group inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-sm leading-tight text-muted/60 outline-none transition-colors hover:bg-[var(--row-hover)] hover:text-foreground focus-visible:bg-[var(--row-hover)]";

  if (mobile) {
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={t`Select machine`}
        trigger={
          <button
            type="button"
            aria-label={triggerLabel}
            aria-expanded={isOpen}
            className={triggerClass}
            onClick={() => setIsOpen(true)}
          >
            {triggerContent}
          </button>
        }
      >
        <div className="m-sheet-list">
          {environments.map((entry) => {
            const selected = entry.project.id === currentProjectId;
            const detail = statusDetail(entry.machine);
            return (
              <button
                key={entry.project.id}
                type="button"
                className="m-sheet-action"
                aria-pressed={selected || undefined}
                disabled={!isSelectable(entry)}
                onClick={() => {
                  setIsOpen(false);
                  select(entry.project.id);
                }}
              >
                <MachineIcon machine={entry.machine} />
                <span className="min-w-0 flex-1 truncate">{machineOptionLabel(entry.machine)}</span>
                {detail ? <StatusText status={detail} /> : null}
                {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      </ResponsiveMenuSurface>
    );
  }

  return (
    <Dropdown>
      <Dropdown.Trigger aria-label={triggerLabel} className={triggerClass}>
        {triggerContent}
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          aria-label={t`Select machine`}
          selectionMode="single"
          selectedKeys={[currentProjectId]}
          // An offline machine stays listed but can't be chosen, exactly like
          // the Settings machine picker; its status is spelled out here.
          disabledKeys={environments
            .filter((entry) => !isSelectable(entry))
            .map((entry) => entry.project.id)}
          onAction={(key) => select(String(key))}
          className="poracode-menu min-w-48"
        >
          {environments.map((entry) => {
            const label = machineOptionLabel(entry.machine);
            const detail = statusDetail(entry.machine);
            return (
              <Dropdown.Item key={entry.project.id} id={entry.project.id} textValue={label}>
                <MachineIcon machine={entry.machine} />
                <Label>{label}</Label>
                {detail ? (
                  <Description>
                    <StatusText status={detail} />
                  </Description>
                ) : null}
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function statusDetail(machine: MachineDescriptor): "offline" | "connecting" | undefined {
  return machine.status === "online" ? undefined : machine.status;
}

function StatusText(props: { status: "offline" | "connecting" }) {
  const label = useRemoteServerStatusLabel(props.status);
  return <span className="shrink-0 text-xs text-muted">{label}</span>;
}
