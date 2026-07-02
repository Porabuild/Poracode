import { useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import type { StatusTone } from "@/renderer/components/providers/statusTone";
import { handleKeyActivate } from "@/renderer/utils/a11y";

export function SidebarButton(props: {
  ref?: React.Ref<HTMLDivElement>;
  icon: React.ReactNode;
  label: React.ReactNode;
  onPress?: () => void;
  isDisabled?: boolean;
  isActive?: boolean;
  iconOnly?: boolean;
  /** Row text size. `xs` is used for thread and worktree list rows. */
  size?: "md" | "xs";
  /**
   * When set, `liveText` defaults to on unless the state is `inactive` or `done`
   * (same rule as list rows for thread status). Overridden by an explicit `liveText` prop.
   */
  statusTone?: StatusTone;
  tooltip?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  onDoubleClick?: () => void;
  isDragging?: boolean;
  isDraggingAnything?: boolean;
  onContextMenu?: React.MouseEventHandler | undefined;
  liveText?: boolean;
}) {
  const {
    ref,
    icon,
    label,
    onPress,
    isDisabled = false,
    isActive = false,
    iconOnly = false,
    size = "md",
    statusTone,
    tooltip,
    suffix,
    className,
    onDoubleClick,
    isDragging,
    isDraggingAnything = false,
    onContextMenu,
    liveText: liveTextProp,
  } = props;

  const liveText =
    liveTextProp !== undefined
      ? liveTextProp
      : statusTone != null
        ? statusTone !== "inactive" && statusTone !== "done"
        : false;

  const labelRef = useRef<HTMLSpanElement>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  const inactiveText = liveText ? "text-foreground/85" : "text-muted";

  const stateClass =
    isDisabled || isDragging
      ? "cursor-not-allowed text-muted/40"
      : isActive && !isDraggingAnything
        ? "bg-[var(--row-active)] text-foreground"
        : `${inactiveText} ${!isDraggingAnything ? "hover:bg-[var(--row-hover)] hover:text-foreground" : ""}`;

  const sizeClass = size === "xs" ? "text-xs" : "text-sm";
  const dragRowDim = isDragging && !iconOnly && !isDisabled ? " opacity-60" : "";

  if (iconOnly) {
    const tooltipContent = tooltip ?? label;
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger className="flex min-h-0 flex-col">
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            className={`flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-3xl outline-none transition-colors focus-visible:focus-ring ${stateClass} ${className ?? ""}`}
            disabled={isDisabled}
            onClick={onPress}
            onContextMenu={onContextMenu}
            type="button"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right">{tooltipContent}</Tooltip.Content>
      </Tooltip>
    );
  }

  const row = (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      aria-grabbed={isDragging}
      className={`group relative flex w-full shrink-0 cursor-default items-center gap-2 rounded-3xl px-2 py-1.5 text-left ${sizeClass} outline-none transition-colors ${stateClass}${dragRowDim} ${className ?? ""}`}
      onClick={isDisabled ? undefined : onPress}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (isDisabled) return;
        // Ignore key events bubbling from a focusable suffix control (e.g. a
        // dismiss button) — only the row itself should activate onPress, so a
        // keyboard user pressing Enter/Space on the suffix doesn't also fire it.
        if (e.target !== e.currentTarget) return;
        handleKeyActivate(e, () => onPress?.());
      }}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <span ref={labelRef} className="block truncate">
          {label}
        </span>
      </div>
      {suffix && <div className="flex shrink-0 items-center gap-[3px]">{suffix}</div>}
    </div>
  );

  if (!tooltip) return row;

  return (
    <Tooltip
      delay={500}
      isOpen={isTooltipOpen}
      onOpenChange={(open) => {
        if (open) {
          const el = labelRef.current;
          if (el && el.scrollWidth > el.clientWidth) {
            setIsTooltipOpen(true);
          }
        } else {
          setIsTooltipOpen(false);
        }
      }}
    >
      <Tooltip.Trigger className="flex w-full min-h-0 flex-col" tabIndex={-1} role="none">
        {row}
      </Tooltip.Trigger>
      <Tooltip.Content placement="right" showArrow className="max-w-[28rem] break-all text-xs">
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
