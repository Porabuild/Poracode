import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Description, Dropdown, Label } from "@heroui/react";
import { dropdownVariants } from "@heroui/styles";
import { Button } from "react-aria-components";
import { useLingui } from "@lingui/react/macro";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useProjectGroup } from "@/renderer/state/projectGroups/useProjectGroups";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
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

/** Single-choice project/environment triggers stay disabled without dimming their label. */
export const UNDIMMED_DISABLED_TRIGGER_CLASS =
  "disabled:cursor-default disabled:opacity-100 aria-disabled:cursor-default aria-disabled:opacity-100 data-[disabled=true]:cursor-default data-[disabled=true]:opacity-100";

/**
 * Shared scale for the composer header's project and environment controls so
 * they sit on the same type/icon rhythm as the adjacent Chat | CLI tabs.
 */
export const PROJECT_CONTROL_ICON_CLASS = "size-3";

export const PROJECT_CONTROL_LABEL_CLASS =
  "inline-flex h-6 min-w-0 items-center gap-1.5 rounded-lg px-1.5 text-[11px] font-semibold leading-tight tracking-tight text-foreground";

export const PROJECT_CONTROL_TRIGGER_CLASS = `group ${PROJECT_CONTROL_LABEL_CLASS} max-w-full outline-none transition-colors hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]`;

/**
 * Where the new thread runs: the machines (Local, WSL distros, paired hosts)
 * that have the current project in the active workspace, with the same
 * glyphs, labels and offline handling as the Settings machine picker. A
 * project on a single paired machine names it as a plain label; a project
 * that only lives here shows nothing, matching the pre-grouping composer.
 */
export function ProjectEnvironmentMenu(
  props: {
    currentProjectId: string;
    /**
     * Pure selection for surfaces that don't own a draft (e.g. the move
     * dialog): called instead of `switchDraftProject`, which would migrate or
     * discard draft content and record workspace usage.
     */
    onSelect?: ((projectId: string) => void) | undefined;
    /**
     * Rows it rejects leave the list entirely — for surfaces that offer only
     * some of the group's environments (e.g. the move dialog's other
     * machines). The current row always stays; offline handling is unchanged.
     */
    filterProject?: ((projectId: string) => boolean) | undefined;
  } & SwitchDraftProjectOptions,
) {
  const { currentProjectId } = props;
  const { t } = useLingui();
  const group = useProjectGroup(currentProjectId);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const isInWorkspace = useWorkspaceProjectFilter();
  const machineFor = useProjectEnvironmentMachineLookup();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);

  // Home is only offered while its scope setting is on, like the switcher.
  if (isHomeProjectId(currentProjectId) && !homeScopeEnabled) return null;

  // Same membership as the project switcher: the active workspace's enabled
  // rows. Home's disabled flag is an internal marker, not a disabled project.
  // The current row always stays, even if it is filed elsewhere.
  const environments = (group?.members ?? []).flatMap((member) => {
    const isCurrent = member.id === currentProjectId;
    if (!isCurrent && ((member.disabled && !isHomeProject(member)) || !isInWorkspace(member))) {
      return [];
    }
    if (!isCurrent && props.filterProject && !props.filterProject(member.id)) {
      return [];
    }
    const entry = machineFor(member);
    return entry ? [entry] : [];
  });
  const current = environments.find((entry) => entry.project.id === currentProjectId);
  if (!current) return null;

  if (environments.length < 2) {
    if (current.machine.ref.host === "local") return null;
    return (
      <span className={`${PROJECT_CONTROL_LABEL_CLASS} shrink`} data-project-environment="">
        <MachineIcon machine={current.machine} className={PROJECT_CONTROL_ICON_CLASS} />
        <span className="min-w-0 truncate">{current.machine.label}</span>
      </span>
    );
  }

  const isEntrySelectable = (entry: ProjectEnvironmentMachine) =>
    entry.machine.status !== "offline";
  const currentLabel = machineOptionLabel(current.machine);
  const triggerLabel = t`Machine: ${currentLabel}`;

  function select(projectIdToOpen: string) {
    const target = environments.find((entry) => entry.project.id === projectIdToOpen);
    if (!target || !isEntrySelectable(target) || projectIdToOpen === currentProjectId) return;
    if (props.onSelect) {
      props.onSelect(projectIdToOpen);
      return;
    }
    switchDraftProject(currentProjectId, projectIdToOpen, props);
  }

  const triggerContent = (
    <>
      <MachineIcon machine={current.machine} className={PROJECT_CONTROL_ICON_CLASS} />
      <span className="min-w-0 truncate">{currentLabel}</span>
      {environments.length > 2 ? (
        <ChevronDown className="-ml-0.5 size-3 shrink-0 text-muted opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      ) : null}
    </>
  );
  // Same type scale and treatment as the project trigger beside it, so the
  // machine reads as a control rather than metadata.
  const triggerClass = PROJECT_CONTROL_TRIGGER_CLASS;

  // Match the worktree control: two choices switch directly on every surface.
  // Use the same React Aria button and styles as Dropdown.Trigger, without
  // introducing menu semantics or the full-size HeroUI Button defaults.
  if (environments.length === 2) {
    const alternative = environments.find((entry) => entry !== current)!;
    return (
      <Button
        aria-label={triggerLabel}
        isDisabled={!isEntrySelectable(alternative)}
        className={dropdownVariants().trigger({
          className: `${triggerClass} ${UNDIMMED_DISABLED_TRIGGER_CLASS} disabled:hover:bg-transparent`,
        })}
        onPress={() => select(alternative.project.id)}
      >
        {triggerContent}
      </Button>
    );
  }

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
                disabled={!isEntrySelectable(entry)}
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
            .filter((entry) => !isEntrySelectable(entry))
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
