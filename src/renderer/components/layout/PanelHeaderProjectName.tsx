import { Tooltip } from "@heroui/react";
import { panelHeaderTooltipTriggerResetClass } from "@/renderer/components/layout/sidebarChrome";

/** Truncated project label with hover tooltip — used in right/bottom panel header bars. */
export function PanelHeaderProjectName(props: {
  name: string;
  maxWidthClass: string;
  triggerClassName?: string;
}) {
  const triggerClassName = props.triggerClassName ? ` ${props.triggerClassName}` : "";
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger
        className={`${panelHeaderTooltipTriggerResetClass} ${props.maxWidthClass}${triggerClassName}`}
      >
        <span className="min-w-0 truncate text-left text-xs font-medium leading-tight text-foreground @max-[400px]:text-[11px]">
          {props.name}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom">{props.name}</Tooltip.Content>
    </Tooltip>
  );
}
