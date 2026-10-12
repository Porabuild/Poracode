import type { ReactNode } from "react";

export const agentPanelTitleTextClass =
  "block truncate text-[0.6875rem] font-medium leading-tight text-foreground";
export const agentPanelMetaTextClass =
  "block truncate text-[0.5625rem] leading-tight text-foreground-muted";

/** Second header row shared by Crossagent, Subagent and side conversations. */
export function AgentPanelTitleRow({
  title,
  leading,
  actions,
  className = "",
}: {
  title: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-6 shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3 ${className}`}
    >
      {leading}
      <div className="min-w-0 flex-1">{title}</div>
      {actions}
    </div>
  );
}
