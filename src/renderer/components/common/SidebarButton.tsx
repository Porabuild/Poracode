import type { DragEventHandler } from "react";
import { Tooltip } from "@heroui/react";

export function SidebarButton(props: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  isDisabled?: boolean;
  isActive?: boolean;
  iconOnly?: boolean;
  suffix?: React.ReactNode;
  className?: string;
  onDragOver?: DragEventHandler<HTMLButtonElement>;
  onDrop?: DragEventHandler<HTMLButtonElement>;
}) {
  const {
    icon,
    label,
    onPress,
    isDisabled = false,
    isActive = false,
    iconOnly = false,
    suffix,
    className,
    onDragOver,
    onDrop,
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
      className={`group flex w-full cursor-default items-center gap-2 rounded-3xl px-4 py-1.5 text-left text-sm transition-colors ${stateClass} ${className ?? ""}`}
      disabled={isDisabled}
      onClick={onPress}
      onDragOver={onDragOver}
      onDrop={onDrop}
      type="button"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {suffix}
    </button>
  );
}
