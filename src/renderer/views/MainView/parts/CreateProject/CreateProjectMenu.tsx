import { useEffect, useState, type ReactNode } from "react";
import { FilePlus, FolderOpen, GitBranch, Monitor, Server } from "lucide-react";
import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { TuxIcon } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  addExistingProject,
  type CreateProjectMode,
} from "@/renderer/actions/createProjectActions";

/** A menu choice: the two create modes plus "clone". */
export type AddProjectAction = CreateProjectMode | "clone" | "remote";

/**
 * The "+" dropdown for creating a project. Wraps a caller-provided trigger
 * (so it can sit in the sidebar header or the welcome screen). "Start from
 * scratch" opens the create-project modal; "Clone a repository" opens the clone
 * modal; "Use an existing folder" goes straight to the system folder picker, as
 * it always has. `onSelect` fires before either action so callers can dismiss
 * surrounding UI (e.g. the welcome overlay).
 */
export function CreateProjectMenu(props: {
  children: ReactNode;
  onSelect?: (action: AddProjectAction) => void;
}) {
  const { t } = useLingui();
  const [wslDistros, setWslDistros] = useState<string[]>([]);

  useEffect(() => {
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
  }, []);

  const existingLabel = t`Use an existing folder`;

  return (
    <Dropdown>
      {props.children}
      <Dropdown.Popover className="min-w-[270px]">
        <Dropdown.Menu
          aria-label={t`Add project options`}
          onAction={(key) => {
            const action = String(key);
            const publicAction: AddProjectAction = action.startsWith("existing-")
              ? "existing"
              : (action as AddProjectAction);
            props.onSelect?.(publicAction);
            if (action === "scratch") {
              usePanelStore.getState().openCreateProjectModal();
            } else if (action === "clone") {
              usePanelStore.getState().openCloneProjectModal();
            } else if (action === "existing" || action === "existing-native") {
              void addExistingProject({ kind: "native" });
            } else if (action.startsWith("existing-wsl:")) {
              void addExistingProject({
                kind: "wsl",
                distro: action.slice("existing-wsl:".length),
              });
            } else {
              usePanelStore.getState().openSettingsSection("remoteServers");
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
          {wslDistros.length > 0 ? (
            <>
              <Dropdown.Item id="existing-native" textValue={`${existingLabel} — ${t`Windows`}`}>
                <Monitor className="size-4 shrink-0 text-muted" />
                <Label>{existingLabel}</Label>
                <span className="ml-auto text-xs text-muted">{t`Windows`}</span>
              </Dropdown.Item>
              {wslDistros.map((distro) => (
                <Dropdown.Item
                  key={distro}
                  id={`existing-wsl:${distro}`}
                  textValue={`${existingLabel} — ${distro}`}
                >
                  <span className="relative size-4 shrink-0">
                    <TuxIcon className="absolute left-1/2 top-1/2 h-3 w-6 -translate-x-1/2 -translate-y-1/2 text-muted" />
                  </span>
                  <Label>{existingLabel}</Label>
                  <span className="ml-auto text-xs text-muted">{distro}</span>
                </Dropdown.Item>
              ))}
            </>
          ) : (
            <Dropdown.Item id="existing" textValue={existingLabel}>
              <FolderOpen className="size-4 shrink-0 text-muted" />
              <Label>{existingLabel}</Label>
            </Dropdown.Item>
          )}
          <Dropdown.Item id="remote" textValue={t`Open over SSH`}>
            <Server className="size-4 shrink-0 text-muted" />
            <Label>
              <Trans>Open over SSH</Trans>
            </Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
