import type { ReactNode } from "react";
import { FilePlus, FolderOpen, GitBranch } from "lucide-react";
import { Dropdown, Label } from "@heroui/react";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  addExistingProject,
  type CreateProjectMode,
} from "@/renderer/actions/createProjectActions";

/** A menu choice: the two create modes plus "clone". */
export type AddProjectAction = CreateProjectMode | "clone";

/**
 * The "+" dropdown for creating a project. Wraps a caller-provided trigger
 * (so it can sit in the sidebar header or the welcome screen). "Start from
 * scratch" opens the create-project modal; "Clone a repository" opens the clone
 * modal; "Use an existing folder" goes straight to the native folder picker, as
 * it always has. `onSelect` fires before either action so callers can dismiss
 * surrounding UI (e.g. the welcome overlay).
 */
export function CreateProjectMenu(props: {
  children: ReactNode;
  onSelect?: (action: AddProjectAction) => void;
}) {
  return (
    <Dropdown>
      {props.children}
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Add project options"
          onAction={(key) => {
            const action = key as AddProjectAction;
            props.onSelect?.(action);
            if (action === "scratch") {
              usePanelStore.getState().openCreateProjectModal();
            } else if (action === "clone") {
              usePanelStore.getState().openCloneProjectModal();
            } else {
              void addExistingProject();
            }
          }}
        >
          <Dropdown.Item id="scratch" textValue="Start from scratch">
            <FilePlus className="size-4 shrink-0 text-muted" />
            <Label>Start from scratch</Label>
          </Dropdown.Item>
          <Dropdown.Item id="clone" textValue="Clone a repository">
            <GitBranch className="size-4 shrink-0 text-muted" />
            <Label>Clone a repository</Label>
          </Dropdown.Item>
          <Dropdown.Item id="existing" textValue="Use an existing folder">
            <FolderOpen className="size-4 shrink-0 text-muted" />
            <Label>Use an existing folder</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
