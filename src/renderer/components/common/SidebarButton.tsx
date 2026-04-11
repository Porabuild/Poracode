import { useRef, useState } from "react";
import { Tooltip } from "@heroui/react";

export function SidebarButton(props: {
  ref?: React.Ref<HTMLDivElement>;
  icon: React.ReactNode;
  label: React.ReactNode;
  onPress?: () => void;
  isDisabled?: boolean;
  isActive?: boolean;
  iconOnly?: boolean;
  tooltip?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  onDoubleClick?: () => void;
  isDragging?: boolean;
  isDraggingAnything?: boolean;
  onContextMenu?: React.MouseEventHandler | undefined;
}) {
  const {
    ref,
    icon,
    label,
    onPress,
    isDisabled = false,
    isActive = false,
    iconOnly = false,
    tooltip,
    suffix,
    className,
    onDoubleClick,
    isDragging,
    isDraggingAnything = false,
    onContextMenu,
  } = props;

  const stateClass =
    isDisabled || isDragging
      ? "cursor-not-allowed text-muted/40"
      : isActive && !isDraggingAnything
        ? "bg-white/[0.08] text-foreground"
        : `text-muted ${!isDraggingAnything ? "hover:bg-white/[0.04] hover:text-foreground" : ""}`;

  if (iconOnly) {
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            className={`flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-3xl transition-colors ${stateClass} ${className ?? ""}`}
            disabled={isDisabled}
            onClick={onPress}
            onContextMenu={onContextMenu}
            type="button"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right">{label}</Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      aria-grabbed={isDragging}
      className={`group relative flex w-full cursor-default items-center gap-2 rounded-3xl px-3 py-1.5 text-left text-sm transition-colors ${stateClass} ${className ?? ""}`}
      onClick={isDisabled ? undefined : onPress}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isDisabled) {
          e.preventDefault();
          onPress?.();
        }
      }}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {tooltip ? (
          <OverflowTooltip tooltip={tooltip}>{label}</OverflowTooltip>
        ) : (
          <span className="block truncate">{label}</span>
        )}
      </div>
      {suffix && <div className="flex shrink-0 items-center gap-[3px]">{suffix}</div>}
    </div>
  );
}

function OverflowTooltip(props: { tooltip: React.ReactNode; children: React.ReactNode }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Tooltip
      delay={500}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) {
          const el = labelRef.current;
          if (el && el.scrollWidth > el.clientWidth) {
            setIsOpen(true);
          }
        } else {
          setIsOpen(false);
        }
      }}
    >
      <Tooltip.Trigger className="block">
        <span ref={labelRef} className="block truncate">
          {props.children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content placement="right" showArrow className="max-w-[28rem] break-all text-xs">
        {props.tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
