import { useLingui } from "@lingui/react/macro";
import { Check, Hourglass, ListChecks } from "lucide-react";
import type { PlanItemPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { getThreadTodoDockStateForItem } from "@/renderer/components/thread/threadTodoState";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";

interface PlanItemProps {
  item: RuntimeChatItem;
}

type StepStatus = PlanItemPayload["steps"][number]["status"];

export function PlanItem({ item }: PlanItemProps) {
  const todoState = getThreadTodoDockStateForItem(item);
  const steps = todoState?.steps ?? [];
  const activeIndex = todoState?.activeIndex ?? -1;
  if (steps.length === 0) return null;
  return (
    <div className="flex gap-2 text-xs">
      <ListChecks className="size-3.5 shrink-0 text-foreground-muted" />
      <ul className="flex min-w-0 flex-1 flex-col">
        {steps.map((step, i) => {
          const isDone = step.status === "completed";
          const isActive = i === activeIndex;
          return (
            <li
              key={i}
              className={`flex items-center gap-2 rounded px-1 py-1 leading-5 ${isDone ? "opacity-60" : ""} ${isActive && !isDone ? "bg-foreground/5" : ""}`}
            >
              <StatusIcon status={step.status} />
              <span
                className={`truncate leading-5 ${isDone ? "text-foreground-muted" : "text-foreground"}`}
              >
                {step.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  const { t } = useLingui();
  switch (status) {
    case "completed":
      return (
        <Check aria-label={t`completed`} className="size-3.5 shrink-0 text-foreground-muted" />
      );
    case "in_progress":
      return (
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <PixelLoader size="xxs" className="text-foreground" />
        </span>
      );
    default:
      return (
        <Hourglass aria-label={t`pending`} className="size-3.5 shrink-0 text-foreground-muted/50" />
      );
  }
}
