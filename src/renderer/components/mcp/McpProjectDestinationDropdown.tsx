import type { ReactNode } from "react";
import { Description, Dropdown, Header, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { useProjectIconNode } from "@/renderer/components/common/ProjectIcon";
import {
  ProjectIconWithRemoteStatus,
  ProjectLocationIcon,
  ProjectRemoteServerIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";

export const GLOBAL_MCP_DESTINATION_ID = "user";
export const MCP_WSL_DESTINATION_PREFIX = "wsl:";
export const MCP_PROJECT_DESTINATION_PREFIX = "project:";

export interface McpProjectDestination {
  id: string;
  name: string;
  location: ProjectLocation;
  /** Custom project icon value (see `Project.icon`), when set. */
  icon?: string;
}

export function mcpProjectDestinationId(projectId: string): string {
  return `${MCP_PROJECT_DESTINATION_PREFIX}${projectId}`;
}

export function mcpWslDestinationId(distro: string): string {
  return `${MCP_WSL_DESTINATION_PREFIX}${distro}`;
}

export function mcpProjectLocationLabel(location: ProjectLocation): string {
  return location.kind === "wsl" ? `${location.distro}: ${location.linuxPath}` : location.path;
}

export function McpProjectDropdownItemContent(props: { project: McpProjectDestination }) {
  const remote = useProjectRemoteServerLookup()(props.project);
  const customIcon = useProjectIconNode(props.project, "size-4 text-muted");
  return (
    <>
      {customIcon ? (
        <ProjectIconWithRemoteStatus icon={customIcon} info={remote} dotClassName="size-1" />
      ) : remote.isRemote ? (
        <ProjectRemoteServerIcon info={remote} className="size-3.5 text-muted" />
      ) : (
        <ProjectLocationIcon location={props.project.location} />
      )}
      <Label>{props.project.name}</Label>
      <Description>
        {remote.serverName ?? mcpProjectLocationLabel(props.project.location)}
      </Description>
    </>
  );
}

export function McpProjectDropdownTriggerContent(props: { project: McpProjectDestination }) {
  const remote = useProjectRemoteServerLookup()(props.project);
  const customIcon = useProjectIconNode(props.project, "size-3.5 text-muted");
  return (
    <span className="flex min-w-0 items-center gap-2">
      {customIcon ? (
        <ProjectIconWithRemoteStatus icon={customIcon} info={remote} dotClassName="size-1" />
      ) : remote.isRemote ? (
        <ProjectRemoteServerIcon info={remote} className="size-3.5 text-muted" />
      ) : (
        <ProjectLocationIcon location={props.project.location} className="size-3.5" />
      )}
      <span className="min-w-0 truncate">{props.project.name}</span>
      {remote.serverName ? (
        <span className="min-w-0 shrink truncate text-xs text-muted/60">{remote.serverName}</span>
      ) : null}
    </span>
  );
}

export function McpProjectDestinationDropdown(props: {
  trigger: ReactNode;
  value: string;
  projects: readonly McpProjectDestination[];
  wslDistros?: readonly string[];
  globalLabel?: ReactNode;
  placement: "bottom end" | "top end";
  ariaLabel: string;
  onChange: (destinationId: string) => void;
}) {
  const { t } = useLingui();
  const hasWslDestinations = Boolean(props.wslDistros?.length);
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
            <Dropdown.Section key="global">
              <Header>
                <Trans>Global</Trans>
              </Header>
              <Dropdown.Item
                id={GLOBAL_MCP_DESTINATION_ID}
                textValue={hasWslDestinations ? t`Global (Windows)` : t`Global`}
              >
                <Label>
                  {hasWslDestinations ? <Trans>Windows</Trans> : (props.globalLabel ?? t`Global`)}
                </Label>
              </Dropdown.Item>
              {props.wslDistros?.map((distro) => (
                <Dropdown.Item
                  key={mcpWslDestinationId(distro)}
                  id={mcpWslDestinationId(distro)}
                  textValue={t`WSL (${distro})`}
                >
                  <Label>WSL</Label>
                  <Description>{distro}</Description>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>,
            ...projectSection,
          ]}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
