import { Fragment } from "react";
import type { ToolCallProgress } from "@/shared/contracts";
import { buildSubAgentProgressParts } from "./subAgentProgress";

export {
  buildSubAgentProgressParts,
  buildSubAgentRowText,
  formatSubAgentEffortLabel,
  formatSubAgentModelLabel,
  hasSubAgentProgressMeta,
  readSubAgentLiveLabel,
  splitAgentTitleMeta,
} from "./subAgentProgress";
export type {
  SubAgentProgressPart,
  SubAgentProgressPartKind,
  SubAgentRowText,
} from "./subAgentProgress";

export function SubAgentProgressMeta({
  progress,
  liveLabel,
  stepCount,
  includeStepCount = false,
  leadingSeparator = false,
  className = "",
  liveMaxClassName = "max-w-[24ch]",
}: {
  progress: ToolCallProgress | undefined;
  liveLabel?: string | undefined;
  stepCount?: number | undefined;
  includeStepCount?: boolean;
  leadingSeparator?: boolean;
  className?: string;
  liveMaxClassName?: string;
}) {
  const parts = buildSubAgentProgressParts({ progress, liveLabel, stepCount, includeStepCount });
  if (parts.length === 0) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 tabular-nums ${className}`}>
      {leadingSeparator && parts.length > 0 ? <span className="shrink-0 opacity-60">·</span> : null}
      {parts.map((part, index) => (
        <Fragment key={`${part.kind}-${index}`}>
          {index > 0 ? <span className="shrink-0 opacity-60">·</span> : null}
          <span
            className={part.kind === "live" ? `${liveMaxClassName} min-w-0 truncate` : "shrink-0"}
            title={part.kind === "live" ? part.label : undefined}
          >
            {part.label}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
