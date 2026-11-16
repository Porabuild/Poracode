import { useContext, useEffect, useState, type ReactNode } from "react";
import { PaneVisibility } from "@/renderer/paneVisibility";
import { PanelActivity } from "@/renderer/components/layout/panelMotion";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { selectVisibleThreadTimelineEntries } from "../../chatPaneSelectors";
import { ChatItemRow } from "./ChatItemRow";

/**
 * Render a workflow agent's transcript with the real chat timeline. The
 * supervisor converts the agent's on-disk jsonl into canonical runtime events;
 * we key them under a synthetic per-agent thread id in the regular runtime
 * store so `ChatItemRow` (which reads items from the store by thread id) works
 * unchanged. Each poll clears and re-applies the synthetic thread — the events
 * are deterministic snapshots, so replacing is cheaper than merging streamed
 * deltas correctly.
 */
interface WorkflowAgentChatProps {
  transcriptDir: string;
  agentId: string;
  /** Terminal agents are fetched once; running agents poll. */
  agentFinished: boolean;
  location: ProjectLocation;
  /** Rendered while no transcript entries are available (yet). */
  fallback: ReactNode;
}

const POLL_INTERVAL_MS = 1500;

export function WorkflowAgentChat({
  transcriptDir,
  agentId,
  agentFinished,
  location,
  fallback,
}: WorkflowAgentChatProps) {
  const visible = useContext(PaneVisibility);
  const syntheticThreadId = `wf-agent-chat:${agentId}`;
  // Deferred fallback: render nothing until the first read settles, so the
  // old boxed sections don't flash before the transcript-backed chat swaps in.
  const [settledAgentId, setSettledAgentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const fetchOnce = async (): Promise<void> => {
      try {
        const { events } = await readBridge().workflowAgentChat({
          threadId: syntheticThreadId,
          transcriptDir,
          agentId,
          agentFinished,
          location,
        });
        if (cancelled) return;
        const store = useAppStore.getState();
        store.clearThreadRuntimeEvents(syntheticThreadId);
        if (events.length > 0) store.applyRuntimeEvents(syntheticThreadId, events);
      } catch (err) {
        console.warn("[workflow] agent chat read failed", { agentId, err });
      }
      if (cancelled) return;
      setSettledAgentId(agentId);
      if (!agentFinished) {
        timer = window.setTimeout(() => void fetchOnce(), POLL_INTERVAL_MS);
      }
    };
    void fetchOnce();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      useAppStore.getState().clearThreadRuntimeEvents(syntheticThreadId);
    };
  }, [syntheticThreadId, transcriptDir, agentId, agentFinished, location]);

  return (
    <PanelActivity visible={visible}>
      <WorkflowAgentTranscript
        threadId={syntheticThreadId}
        agentFinished={agentFinished}
        fallback={settledAgentId === agentId ? fallback : null}
      />
    </PanelActivity>
  );
}

function WorkflowAgentTranscript({
  threadId,
  agentFinished,
  fallback,
}: {
  threadId: string;
  agentFinished: boolean;
  fallback: ReactNode;
}) {
  const entries = useAppStore((s) => selectVisibleThreadTimelineEntries(s, threadId));
  if (entries.length === 0) return fallback;
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry, index) => (
        <ChatItemRow
          key={entry.id}
          threadId={threadId}
          entry={entry}
          isLastEntry={!agentFinished && index === entries.length - 1}
          checkpointRevert={null}
        />
      ))}
    </div>
  );
}
