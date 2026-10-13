import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { Check } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";

const AUTO_HIDE_SECONDS = 10;

/** Mounted only after discovery finishes, keeping countdown renders in the footer. */
export function AgentDiscoveryDoneButton(props: { onDone: () => void }) {
  const [remainingSeconds, setRemainingSeconds] = useState(AUTO_HIDE_SECONDS);
  const autoHideCancelled = useAgentStatusesStore((s) => s.discoveryAutoHideCancelled);
  const finish = useEffectEvent(() => {
    if (!useAgentStatusesStore.getState().discoveryAutoHideCancelled) props.onDone();
  });

  useEffect(() => {
    if (autoHideCancelled) return;
    const deadline = Date.now() + AUTO_HIDE_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining === 0) {
        window.clearInterval(timer);
        finish();
      } else {
        setRemainingSeconds(remaining);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoHideCancelled]);

  return (
    <Button size="sm" variant="secondary" className="tabular-nums" onPress={props.onDone}>
      <Check className="size-3.5" />
      {autoHideCancelled ? <Trans>Done</Trans> : <Trans>Done ({remainingSeconds}s)</Trans>}
    </Button>
  );
}
