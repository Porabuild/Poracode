import {
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useId,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type SVGProps,
} from "react";
import { Tooltip } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import {
  floatingBubbleActiveClass,
  floatingBubblePillClass,
} from "@/renderer/components/layout/floatingGlass";

const ThreadDockPlacementContext = createContext<"composer" | "right">("composer");
const ThreadDockSortableContext = createContext(false);

export function ThreadDockSortableScope({
  sortable = true,
  children,
}: {
  sortable?: boolean;
  children: ReactNode;
}) {
  return (
    <ThreadDockSortableContext.Provider value={sortable}>
      {children}
    </ThreadDockSortableContext.Provider>
  );
}

export function useThreadDockPlacement(): "composer" | "right" {
  return useContext(ThreadDockPlacementContext);
}

export function useIsSortableThreadDock(): boolean {
  return useContext(ThreadDockSortableContext);
}

export function ThreadDockSection({
  children,
  placement = "composer",
  collapsed = false,
  className = "",
  ariaLabel,
}: {
  children: ReactNode;
  placement?: "composer" | "right";
  collapsed?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useLingui();
  const resolvedAriaLabel = ariaLabel ?? t`Thread dock`;
  // Right-panel docks render as distinct Soft hairline cards; composer
  // sections keep the bordered strip chrome.
  const baseClass =
    placement === "composer"
      ? "flex flex-col border-b border-[var(--hairline-soft)] bg-transparent text-xs"
      : "content-surface flex flex-col overflow-hidden text-xs";

  return (
    <ThreadDockPlacementContext.Provider value={placement}>
      <section
        aria-label={resolvedAriaLabel}
        className={className ? `${baseClass} ${className}` : baseClass}
        data-collapsed={collapsed ? "true" : "false"}
        data-placement={placement}
      >
        {children}
      </section>
    </ThreadDockPlacementContext.Provider>
  );
}

export function ThreadDockHeader({
  icon: Icon,
  iconClassName = "text-foreground-muted",
  title,
  countLabel,
  actions,
  collapse,
  stackedContent = false,
  children,
}: {
  icon: React.ElementType<{ className?: string }> | ReactElement;
  iconClassName?: string;
  title: string;
  countLabel?: ReactNode;
  actions?: ReactNode;
  collapse?: { collapsed: boolean; onToggle: () => void };
  stackedContent?: boolean;
  children?: ReactNode;
}) {
  const placement = useThreadDockPlacement();
  const sortable = useIsSortableThreadDock();
  const detailsId = useId();
  const hasDescribedDetails = Boolean(collapse && (countLabel || children));
  const isRightCard = placement === "right";
  const content = (
    <>
      <span className="inline-flex size-4 shrink-0 items-center justify-center">
        {isValidElement(Icon) ? Icon : <Icon className={`size-3.5 shrink-0 ${iconClassName}`} />}
      </span>
      <span
        className={`flex min-w-0 flex-1 ${
          stackedContent
            ? isRightCard
              ? "flex-col items-start gap-0.5 leading-tight"
              : "flex-col items-start gap-0.5 leading-none"
            : isRightCard
              ? "items-center gap-2 leading-4"
              : "items-baseline gap-2 leading-none"
        }`}
        data-stacked={stackedContent ? "true" : undefined}
      >
        <span
          className={
            isRightCard
              ? "shrink-0 font-semibold leading-4 text-foreground"
              : "font-semibold text-foreground"
          }
        >
          {title}
        </span>
        {(() => {
          const details = (
            <>
              {countLabel && (
                <span
                  className={
                    isRightCard
                      ? "inline-flex shrink-0 items-center gap-1 text-[0.85em] leading-4 text-[color:var(--muted)]"
                      : "inline-flex items-baseline gap-1 text-[0.85em] leading-none text-[color:var(--muted)]"
                  }
                >
                  {countLabel}
                </span>
              )}
              {children}
            </>
          );
          return hasDescribedDetails ? (
            <span id={detailsId} className="contents">
              {details}
            </span>
          ) : (
            details
          );
        })()}
      </span>
    </>
  );
  return (
    <div
      className={
        isRightCard
          ? `flex h-9 items-center gap-2 ${sortable ? "pl-[30px] pr-1.5" : "pl-3 pr-1.5"}`
          : "flex h-8 items-center gap-2 px-2 leading-none"
      }
    >
      {collapse ? (
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent p-0 text-left text-xs font-normal outline-none focus-visible:focus-ring"
          aria-label={title}
          aria-expanded={!collapse.collapsed}
          {...(hasDescribedDetails ? { "aria-describedby": detailsId } : {})}
          onClick={collapse.onToggle}
        >
          {content}
        </button>
      ) : (
        <div className="flex h-full min-w-0 flex-1 items-center gap-2">{content}</div>
      )}
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </div>
  );
}

export function ThreadDockCountBadge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`ml-auto shrink-0 rounded-2xl border border-[var(--hairline-soft)] bg-foreground/[0.04] px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-muted${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </span>
  );
}

export function ThreadDockProgressRing({
  percent,
  size = 16,
  radius = 6,
  progressStroke = "var(--foreground)",
  showZeroProgress = false,
  className = "",
  ...rest
}: {
  percent: number | undefined;
  size?: number;
  radius?: number;
  progressStroke?: string;
  showZeroProgress?: boolean;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox">) {
  const circumference = 2 * Math.PI * radius;
  const clamped = percent === undefined ? undefined : Math.max(0, Math.min(100, percent));
  const progress = clamped === undefined ? 0 : (clamped / 100) * circumference;
  const showProgress = clamped !== undefined && (showZeroProgress || clamped > 0);
  return (
    <svg
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      {...rest}
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="color-mix(in oklab, var(--foreground) 18%, transparent)"
        strokeWidth="1.65"
      />
      {showProgress ? (
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke={progressStroke}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform="rotate(-90 8 8)"
        />
      ) : null}
    </svg>
  );
}

export function ThreadDockBubble({
  dataAttr = "data-dock-bubble",
  dataValue,
  label,
  showLabel,
  tooltip,
  active,
  icon,
  onPress,
  children,
}: {
  dataAttr?: "data-dock-bubble" | "data-images-bubble";
  dataValue: string;
  label: string;
  showLabel?: string;
  tooltip?: string;
  active: boolean;
  icon: ReactNode;
  onPress: () => void;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const dataProps = { [dataAttr]: dataValue };
  const bubble = (
    <button
      type="button"
      aria-label={active ? t`Hide ${label}` : (showLabel ?? t`Show ${label}`)}
      aria-pressed={active}
      {...dataProps}
      className={`${floatingBubblePillClass} px-2.5 ${active ? floatingBubbleActiveClass : ""}`}
      onClick={onPress}
    >
      {icon}
      {children}
    </button>
  );
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger tabIndex={-1} role="none">
        {bubble}
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" className="max-w-[28rem] text-xs">
        {tooltip ? `${label} · ${tooltip}` : label}
      </Tooltip.Content>
    </Tooltip>
  );
}

export function ThreadDockBody({
  children,
  padding = "default",
  className = "",
}: {
  children: ReactNode;
  padding?: "default" | "compact" | "media";
  className?: string;
}) {
  const placement = useThreadDockPlacement();
  const paddingClass =
    padding === "compact"
      ? "px-1.5 py-2"
      : padding === "media"
        ? "p-2.5"
        : placement === "right"
          ? "px-3 py-2.5"
          : "px-3 pb-2";
  const dividerClass = placement === "right" ? "border-t border-[var(--hairline-soft)] " : "";
  const baseClass = `${dividerClass}${paddingClass}`;
  return <div className={className ? `${baseClass} ${className}` : baseClass}>{children}</div>;
}

export function ThreadDockIconButton({
  label,
  tooltip = label,
  danger = false,
  isDisabled = false,
  isPending = false,
  compact = false,
  ariaExpanded,
  ariaControls,
  ariaPressed,
  onMouseDown,
  onPress,
  children,
}: {
  label: string;
  tooltip?: ReactNode;
  danger?: boolean;
  isDisabled?: boolean;
  isPending?: boolean;
  compact?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaPressed?: boolean;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger tabIndex={-1} role="none">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          {...(ariaExpanded !== undefined ? { "aria-expanded": ariaExpanded } : {})}
          {...(ariaControls ? { "aria-controls": ariaControls } : {})}
          {...(ariaPressed !== undefined ? { "aria-pressed": ariaPressed } : {})}
          className={`${compact ? "h-5 w-5" : "h-6 w-6"} min-w-0 shrink-0 text-muted/70 ${
            danger
              ? "hover:bg-danger-500/10 hover:text-danger-500"
              : "hover:bg-foreground/5 hover:text-foreground"
          }`}
          isDisabled={isDisabled}
          isPending={isPending}
          {...(onMouseDown ? { onMouseDown } : {})}
          onPress={onPress}
        >
          {children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip>
  );
}

export function ThreadDockCollapseButton({
  collapsed,
  label,
  controlsId,
  onPress,
}: {
  collapsed: boolean;
  label: string;
  controlsId?: string;
  onPress: () => void;
}) {
  const { t } = useLingui();
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger tabIndex={-1} role="none">
        <button
          type="button"
          aria-label={label}
          aria-expanded={!collapsed}
          {...(controlsId ? { "aria-controls": controlsId } : {})}
          className="inline-flex h-6 w-6 min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-3xl text-muted/70 transition-colors hover:bg-foreground/5 hover:text-foreground outline-none focus-visible:focus-ring"
          onClick={onPress}
        >
          <ChevronDown
            className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
          />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content>{collapsed ? t`Expand` : t`Collapse`}</Tooltip.Content>
    </Tooltip>
  );
}

export function ThreadDockList({
  children,
  placement = "composer",
  collapsed = false,
  gap = "none",
}: {
  children: ReactNode;
  placement?: "composer" | "right";
  collapsed?: boolean;
  gap?: "none" | "px" | "0.5" | "1";
}) {
  const spacingClass =
    gap === "px"
      ? "space-y-px"
      : gap === "0.5"
        ? "space-y-0.5"
        : gap === "1"
          ? "space-y-1"
          : "space-y-0";
  return (
    <div
      className={
        placement === "right" ? "border-t border-[var(--hairline-soft)] px-1.5 py-2" : "px-1 pb-1"
      }
    >
      <ul
        className={
          collapsed
            ? spacingClass
            : placement === "composer"
              ? `max-h-[min(12rem,32vh)] ${spacingClass} overflow-y-auto [scrollbar-gutter:stable]`
              : spacingClass
        }
      >
        {children}
      </ul>
    </div>
  );
}

export const ThreadDockRow = forwardRef<
  HTMLLIElement,
  {
    children: ReactNode;
    isActive?: boolean;
    isDone?: boolean;
    title?: string;
    onClick?: () => void;
    /**
     * Stable identity key for the row (e.g. `${sourceId}:${index}`). Rendered
     * as `data-row-key` so owners can look the row up among its siblings
     * without keeping a ref per row.
     */
    rowKey?: string;
  }
>(function ThreadDockRow({ children, isActive, isDone, title, onClick, rowKey }, ref) {
  const placement = useThreadDockPlacement();
  const innerClass = `flex items-center gap-2 rounded-3xl ${
    placement === "right" ? "px-1.5 py-1.5" : "px-2 py-1"
  } leading-5 ${isDone ? "opacity-60" : ""} ${isActive && !isDone ? "bg-accent/10" : ""}`;
  const rowKeyAttrs = rowKey ? { "data-row-key": rowKey } : {};

  if (onClick) {
    return (
      <li ref={ref} className="flex" {...rowKeyAttrs}>
        <button
          type="button"
          onClick={onClick}
          className={`group flex min-w-0 flex-1 text-left transition-colors hover:bg-foreground/5 ${innerClass}`}
          aria-label={title}
          title={title}
        >
          {children}
        </button>
      </li>
    );
  }

  return (
    <li
      ref={ref}
      className={innerClass}
      title={title}
      aria-current={isActive ? "step" : undefined}
      {...rowKeyAttrs}
    >
      {children}
    </li>
  );
});

export function ThreadDockActionRow({
  children,
  title,
  onClick,
  className = "",
  action,
  actionLabel,
  actionTitle,
  onAction,
  isActionDisabled = false,
}: {
  children: ReactNode;
  title?: string;
  onClick?: () => void;
  className?: string;
  action: ReactNode;
  actionLabel: string;
  actionTitle?: string;
  onAction: () => void;
  isActionDisabled?: boolean;
}) {
  const contentClass = `poracode-subagent-dock-row flex min-w-0 flex-1 items-center gap-2 rounded-3xl px-2 py-1 text-left leading-5 transition-[padding,background-color] duration-150 hover:bg-foreground/5 group-hover:pr-8 ${className}`;

  return (
    <li className="group relative flex">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={contentClass}
          aria-label={title}
          title={title}
        >
          {children}
        </button>
      ) : (
        <div className={contentClass} title={title}>
          {children}
        </div>
      )}
      <button
        type="button"
        aria-label={actionLabel}
        title={actionTitle}
        disabled={isActionDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onAction();
        }}
        className="poracode-subagent-dismiss absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-0.5 text-muted/70 opacity-0 transition-opacity duration-150 hover:bg-danger-500/10 hover:text-danger-500 focus:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
      >
        {action}
      </button>
    </li>
  );
}
