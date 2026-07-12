import type { ReactNode } from "react";
import { Description, Dropdown, Header, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { TuxIcon } from "@/renderer/components/common";

export const GLOBAL_MCP_DESTINATION_ID = "user";
export const MCP_PROJECT_DESTINATION_PREFIX = "project:";

export interface McpProjectDestination {
  id: string;
  name: string;
  location: ProjectLocation;
}

export function mcpProjectDestinationId(projectId: string): string {
  return `${MCP_PROJECT_DESTINATION_PREFIX}${projectId}`;
}

export function mcpProjectLocationLabel(location: ProjectLocation): string {
  return location.kind === "wsl" ? `${location.distro}: ${location.linuxPath}` : location.path;
}

export function McpProjectDropdownItemContent(props: { project: McpProjectDestination }) {
  return (
    <>
      <Label>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{props.project.name}</span>
          {props.project.location.kind === "wsl" ? (
            <span className="relative size-4 shrink-0 text-muted" aria-hidden="true">
              <TuxIcon className="absolute left-1/2 top-1/2 h-3.5 w-6 -translate-x-1/2 -translate-y-1/2" />
            </span>
          ) : null}
        </span>
      </Label>
      <Description>{mcpProjectLocationLabel(props.project.location)}</Description>
    </>
  );
}

export function McpProjectDestinationDropdown(props: {
  trigger: ReactNode;
  value: string;
  projects: readonly McpProjectDestination[];
  placement: "bottom end" | "top end";
  ariaLabel: string;
  onChange: (destinationId: string) => void;
}) {
  const { t } = useLingui();
  const projectSection =
    props.projects.length > 0
      ? [
          <Dropdown.Section key="projects">
            <Header>
              <Trans>Projects</Trans>
            </Header>
            {props.projects.map((project) => (
              <Dropdown.Item
                key={mcpProjectDestinationId(project.id)}
                id={mcpProjectDestinationId(project.id)}
                textValue={project.name}
              >
                <Dropdown.ItemIndicator />
                <McpProjectDropdownItemContent project={project} />
              </Dropdown.Item>
            ))}
          </Dropdown.Section>,
        ]
      : [];

  return (
    <Dropdown>
      {props.trigger}
      <Dropdown.Popover placement={props.placement}>
        <Dropdown.Menu
          aria-label={props.ariaLabel}
          selectionMode="single"
          selectedKeys={[props.value]}
          onAction={(key) => props.onChange(String(key))}
        >
          {[
            <Dropdown.Item
              key={GLOBAL_MCP_DESTINATION_ID}
              id={GLOBAL_MCP_DESTINATION_ID}
              textValue={t`Global`}
            >
              <Dropdown.ItemIndicator />
              <Label>
                <Trans>Global</Trans>
              </Label>
            </Dropdown.Item>,
            ...projectSection,
          ]}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
