import { forwardRef, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";

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
  const baseClass =
    placement === "composer"
      ? "flex flex-col border-b border-[color:var(--border)] bg-transparent text-xs"
      : collapsed
        ? "flex flex-col rounded-2xl border border-[color:var(--border)] bg-[var(--composer-surface)] text-xs"
        : "flex h-full min-h-0 flex-col rounded-2xl border border-[color:var(--border)] bg-[var(--composer-surface)] text-xs";

  return (
    <section
      aria-label={resolvedAriaLabel}
      className={`${baseClass} ${className}`}
      data-collapsed={collapsed ? "true" : "false"}
      data-placement={placement}
    >
      {children}
    </section>
  );
}

export function ThreadDockHeader({
  icon: Icon,
  iconClassName = "text-foreground-muted",
  title,
  countLabel,
  actions,
  children,
}: {
  icon: React.ElementType<{ className?: string }>;
  iconClassName?: string;
  title: string;
  countLabel?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 leading-none">
      <Icon className={`size-3.5 shrink-0 ${iconClassName}`} />
      <div className="flex min-w-0 flex-1 items-center gap-2 leading-none">
        <span className="font-semibold text-foreground">{title}</span>
        {countLabel && (
          <span className="flex items-center gap-1 text-[0.85em] text-[color:var(--muted)]">
            {countLabel}
          </span>
        )}
        {children}
      </div>
      {actions}
    </div>
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
    <div className={placement === "right" && !collapsed ? "min-h-0 flex-1 px-1 pb-1" : "px-1 pb-1"}>
      <ul
        className={
          collapsed
            ? spacingClass
            : placement === "composer"
              ? `max-h-[min(12rem,32vh)] ${spacingClass} overflow-y-auto [scrollbar-gutter:stable]`
              : `min-h-0 h-full ${spacingClass} overflow-y-auto [scrollbar-gutter:stable]`
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
  }
>(function ThreadDockRow({ children, isActive, isDone, title, onClick }, ref) {
  const innerClass = `flex items-center gap-2 rounded px-2 py-1 leading-5 ${
    isDone ? "opacity-60" : ""
  } ${isActive && !isDone ? "bg-accent/10" : ""}`;

  if (onClick) {
    return (
      <li ref={ref} className="flex">
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
    <li ref={ref} className={innerClass} title={title} aria-current={isActive ? "step" : undefined}>
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
  const contentClass = `poracode-subagent-dock-row flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left leading-5 transition-[padding,background-color] duration-150 hover:bg-foreground/5 group-hover:pr-8 ${className}`;

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
