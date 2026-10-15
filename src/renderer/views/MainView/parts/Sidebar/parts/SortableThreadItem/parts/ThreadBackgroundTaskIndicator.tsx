import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Activity } from "lucide-react";
import { useAppStore } from "@/renderer/state/appStore";

/** Keeps detached tasks discoverable after the thread's Working indication ends. */
export function ThreadBackgroundTaskIndicator({
  threadId,
  isWorking,
}: {
  threadId: string;
  isWorking: boolean;
}) {
  const { t } = useLingui();
  // Dock dismissal only hides its content; the live roster still owns this cue.
  const count = useAppStore((s) => s.runtimeBackgroundTasksByThread[threadId]?.length ?? 0);
  if (isWorking || count === 0) return null;

  const label = t`Running background tasks: ${count}`;
  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger tabIndex={-1} role="none" className="inline-flex shrink-0">
        <Activity role="img" aria-label={label} className="size-3 text-muted" />
      </Tooltip.Trigger>
      <Tooltip.Content placement="right" className="text-xs">
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}
