import { Loader2, Send, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PendingSteerState } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import {
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockList,
  ThreadDockRow,
  ThreadDockSection,
} from "./ThreadDockUI";

interface ThreadPendingSteerStripProps {
  pending: PendingSteerState;
  onCancel: () => void;
}

/**
 * Compact strip rendered above the composer while a steer message is staged
 * but not yet flushed (the gap between cancel-issued and cancel-acked).
 * Mirrors `ThreadTodoDock` chrome so the queue affordance feels native to
 * the composer surface.
 */
export function ThreadPendingSteerStrip(props: ThreadPendingSteerStripProps) {
  const { pending, onCancel } = props;
  const { t } = useLingui();
  // Segment-carrying steers preview from the original display segments — the
  // provider prompt inlines mention instructions the user never typed.
  const preview = (
    pending.segments && pending.segments.length > 0
      ? pending.segments.map(inlinePromptSegmentText).join("")
      : pending.prompt
  ).trim();
  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={Send}
        title={t`Pending steer`}
        countLabel={
          <>
            <Loader2 className="size-3 animate-spin" />
            <Trans>waiting for agent to stop</Trans>
          </>
        }
        actions={
          <ThreadDockIconButton label={t`Cancel pending steer`} onPress={onCancel}>
            <X className="size-3.5" />
          </ThreadDockIconButton>
        }
      />
      <ThreadDockList placement="composer" collapsed={false}>
        <ThreadDockRow title={preview}>
          <span className="min-w-0 flex-1 truncate text-foreground">{preview}</span>
        </ThreadDockRow>
      </ThreadDockList>
    </ThreadDockSection>
  );
}
