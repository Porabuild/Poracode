import { Dropdown } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import {
  McpProjectDropdownItemContent,
  type McpProjectDestination,
} from "./McpProjectDestinationDropdown";

/** Project chooser that hands off to a project's own MCP settings page. */
export function McpProjectSettingsPicker(props: {
  projects: readonly McpProjectDestination[];
  onOpen: (projectId: string) => void;
}) {
  const { t } = useLingui();
  return (
    <Dropdown>
      <Button
        size="sm"
        variant="tertiary"
        aria-label={t`Open a project's MCP settings`}
        isDisabled={props.projects.length === 0}
      >
        <Trans>Choose project</Trans>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label={t`Projects`} onAction={(key) => props.onOpen(String(key))}>
          {props.projects.map((project) => (
            <Dropdown.Item key={project.id} id={project.id} textValue={project.name}>
              <McpProjectDropdownItemContent project={project} />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
