import type { ReactNode } from "react";
import { FilePlus, FolderOpen, GitBranch } from "lucide-react";
import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  return (
    <Dropdown>
      {props.children}
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={t`Add project options`}
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
          <Dropdown.Item id="scratch" textValue={t`Start from scratch`}>
            <FilePlus className="size-4 shrink-0 text-muted" />
            <Label>
              <Trans>Start from scratch</Trans>
            </Label>
          </Dropdown.Item>
          <Dropdown.Item id="clone" textValue={t`Clone a repository`}>
            <GitBranch className="size-4 shrink-0 text-muted" />
            <Label>
              <Trans>Clone a repository</Trans>
            </Label>
          </Dropdown.Item>
          <Dropdown.Item id="existing" textValue={t`Use an existing folder`}>
            <FolderOpen className="size-4 shrink-0 text-muted" />
            <Label>
              <Trans>Use an existing folder</Trans>
            </Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
