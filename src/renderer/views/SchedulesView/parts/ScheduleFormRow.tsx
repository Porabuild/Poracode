import type { ReactNode } from "react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";

export const SCHEDULE_CONTROL_WIDTH = "w-[280px] max-w-full shrink-0";

export function ScheduleFormRow(props: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const compact = useCompactLayout();
  return (
    <div
      className={
        compact
          ? "flex flex-col items-stretch gap-2 py-2"
          : "flex min-h-11 items-center justify-between gap-4 py-1.5"
      }
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        {props.description ? <p className="text-xs text-muted">{props.description}</p> : null}
      </div>
      <div className={compact ? "w-full min-w-0" : "flex shrink-0 justify-end"}>
        {props.children}
      </div>
    </div>
  );
}
