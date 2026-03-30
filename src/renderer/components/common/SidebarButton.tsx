import { useRef, useState, type DragEventHandler } from "react";
import { Tooltip } from "@heroui/react";
import { GripVertical } from "lucide-react";

export function SidebarButton(props: {
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
  onDragOver?: DragEventHandler<HTMLButtonElement>;
  onDrop?: DragEventHandler<HTMLButtonElement>;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  isDragging?: boolean;
  dragLabel?: string;
}) {
  const {
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
    onDragOver,
    onDrop,
    onDragStart,
    onDragEnd,
    isDragging,
    dragLabel,
  } = props;

  const stateClass = isDisabled
    ? "cursor-not-allowed text-muted/40"
    : isActive
      ? "bg-white/[0.08] text-foreground"
      : "text-muted hover:bg-white/[0.04] hover:text-foreground";

  if (iconOnly) {
    return (
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <button
            className={`flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-3xl transition-colors ${stateClass} ${className ?? ""}`}
            disabled={isDisabled}
            onClick={onPress}
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
    <button
      className={`group relative flex w-full cursor-default items-center gap-2 rounded-3xl py-1.5 text-left text-sm transition-colors ${onDragStart ? "pl-3 pr-4" : "px-3"} ${stateClass} ${className ?? ""}`}
      disabled={isDisabled}
      onClick={onPress}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      type="button"
    >
      {icon}
      <div className="min-w-0 flex-1">
        {tooltip ? (
          <OverflowTooltip tooltip={tooltip}>{label}</OverflowTooltip>
        ) : (
          <span className="block truncate">{label}</span>
        )}
      </div>
      {suffix && <div className="flex shrink-0 items-center gap-1.5">{suffix}</div>}
      {onDragStart && (
        <div
          role="button"
          tabIndex={0}
          aria-grabbed={isDragging}
          aria-label={dragLabel}
          className="absolute right-1 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto shrink-0 cursor-grab rounded text-muted/60 active:cursor-grabbing"
          draggable
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <GripVertical className="size-3.5" />
        </div>
      )}
    </button>
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
      <Tooltip.Trigger>
        <span ref={labelRef} className="block truncate">
          {props.children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow className="max-w-[28rem] break-all text-xs">
        {props.tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
