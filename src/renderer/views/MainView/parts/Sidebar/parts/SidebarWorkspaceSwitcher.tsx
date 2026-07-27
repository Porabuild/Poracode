import { useState, type ReactNode } from "react";
import { Dropdown, Label, Separator } from "@heroui/react";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { openWorkspaceSettings } from "@/renderer/actions/panelActions";
import { createWorkspace } from "@/renderer/actions/workspaceActions";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { WorkspaceNameDialog } from "@/renderer/components/workspace/WorkspaceNameDialog";
import { WorkspaceIcon } from "@/renderer/components/workspace/WorkspaceIcon";
import {
  WORKSPACE_ADD_KEY,
  WORKSPACE_MANAGE_KEY,
  parseWorkspaceMenuKey,
  workspaceMenuKey,
} from "@/renderer/components/workspace/workspaceMenuKeys";
import { sidebarRowClass } from "@/renderer/components/common/SidebarButton";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useActiveWorkspaceId, useWorkspaceStore } from "@/renderer/state/workspaceStore";

interface MenuEntry {
  key: string;
  label: string;
  icon: ReactNode;
  /** Only workspace rows carry a selected state. */
  isSelected?: boolean;
}

/**
 * Switches which workspace the sidebar (and the schedules / pull-request views)
 * is scoped to. Lives at the top of the sidebar footer nav so it reads as
 * ambient context for the navigation below it rather than another destination.
 */
export function SidebarWorkspaceSwitcher() {
  const { t } = useLingui();
  const workspaces = useSharedSettings((state) => state.workspaces);
  const activeWorkspaceId = useActiveWorkspaceId();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Nothing to switch between before the first-run bootstrap has seeded the
  // defaults; showing an empty switcher would just be a dead control.
  if (workspaces.length === 0) return null;

  // `useActiveWorkspaceId` falls back to the first workspace, so this resolves.
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]!;

  function handleAction(key: string) {
    setIsOpen(false);
    const selection = parseWorkspaceMenuKey(key);
    if (!selection) return;
    if (selection.kind === "add") setAddOpen(true);
    else if (selection.kind === "manage") openWorkspaceSettings();
    else if (selection.kind === "workspace") {
      useWorkspaceStore.getState().setActiveWorkspaceId(selection.workspaceId);
    }
  }

  // Built once so the desktop menu and the mobile sheet can never drift apart.
  const workspaceEntries: MenuEntry[] = workspaces.map((workspace) => ({
    key: workspaceMenuKey(workspace.id),
    label: workspace.name,
    icon: <WorkspaceIcon icon={workspace.icon} className="size-4 text-muted" />,
    isSelected: workspace.id === active.id,
  }));
  const actionEntries: MenuEntry[] = [
    {
      key: WORKSPACE_ADD_KEY,
      label: t`Add workspace`,
      icon: <Plus className="size-4 shrink-0 text-muted" />,
    },
    {
      key: WORKSPACE_MANAGE_KEY,
      label: t`Manage workspaces`,
      icon: <Settings2 className="size-4 shrink-0 text-muted" />,
    },
  ];

  const triggerContent = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <WorkspaceIcon icon={active.icon} className="size-4 text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-left">{active.name}</span>
      </div>
      <span className="flex shrink-0 items-center">
        <ChevronsUpDown className="size-3.5 text-muted" />
      </span>
    </>
  );

  const trigger = (
    <button
      type="button"
      aria-label={t`Switch workspace`}
      aria-expanded={isOpen}
      className={sidebarRowClass()}
      // Desktop presses are wired by Popover.Trigger; the mobile sheet has no
      // trigger wiring of its own, so it opens the drawer directly.
      {...(mobile ? { onClick: () => setIsOpen(true) } : {})}
    >
      {triggerContent}
    </button>
  );

  const dialog = (
    <WorkspaceNameDialog
      isOpen={addOpen}
      mode="create"
      onSubmit={(name) => createWorkspace(name)}
      onClose={() => setAddOpen(false)}
    />
  );

  if (mobile) {
    return (
      <>
        <ResponsiveMenuSurface
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label={t`Switch workspace`}
          trigger={trigger}
        >
          <div className="m-sheet-list">
            {workspaceEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="m-sheet-action"
                aria-pressed={entry.isSelected || undefined}
                onClick={() => handleAction(entry.key)}
              >
                {entry.icon}
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.isSelected ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </button>
            ))}
            <Separator variant="tertiary" className="my-1" />
            {actionEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="m-sheet-action"
                onClick={() => handleAction(entry.key)}
              >
                {entry.icon}
                <span className="flex-1 truncate">{entry.label}</span>
              </button>
            ))}
          </div>
        </ResponsiveMenuSurface>
        {dialog}
      </>
    );
  }

  return (
    <>
      <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
        <Dropdown.Trigger aria-label={t`Switch workspace`} className={sidebarRowClass()}>
          {triggerContent}
        </Dropdown.Trigger>
        <Dropdown.Popover placement="top start">
          <Dropdown.Menu
            aria-label={t`Workspaces`}
            className="poracode-menu min-w-56"
            selectionMode="single"
            // The trailing action rows aren't workspaces, so they never match a
            // selected key and render without a check.
            selectedKeys={[workspaceMenuKey(active.id)]}
            onAction={(key) => handleAction(String(key))}
          >
            <Dropdown.Section>
              {workspaceEntries.map((entry) => (
                <Dropdown.Item key={entry.key} id={entry.key} textValue={entry.label}>
                  {entry.icon}
                  <Label>{entry.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
            <Separator variant="tertiary" />
            <Dropdown.Section>
              {actionEntries.map((entry) => (
                <Dropdown.Item key={entry.key} id={entry.key} textValue={entry.label}>
                  {entry.icon}
                  <Label>{entry.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {dialog}
    </>
  );
}
