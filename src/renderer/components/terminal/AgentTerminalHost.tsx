import { useShallow } from "zustand/shallow";
import { selectHiddenHostedAgentTerminalIds } from "@/renderer/components/terminal/hostedAgentTerminalIds";
import { TerminalPane } from "@/renderer/components/thread/TerminalPane";
import { useRemoteTerminalTransport } from "@/renderer/components/thread/useRemoteTerminalTransport";
import { useAppStore } from "@/renderer/state/appStore";
import { useThread } from "@/renderer/state/useThread";

/**
 * Parks terminal surfaces removed from the visible pane tree. Their xterm
 * instances hand off through `xtermInstanceCache`; the host keeps output
 * subscriptions active until they become visible again or leave the LRU.
 */
export function AgentTerminalHost() {
  const ids = useAppStore(useShallow(selectHiddenHostedAgentTerminalIds));
  if (ids.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed left-[-10000px] top-0 overflow-hidden"
    >
      {ids.map((threadId) => (
        <HostedHiddenAgentTerminal key={threadId} threadId={threadId} />
      ))}
    </div>
  );
}

function HostedHiddenAgentTerminal(props: { threadId: string }) {
  const thread = useThread(props.threadId);
  const remoteTransport = useRemoteTerminalTransport(props.threadId);
  if (!thread) return null;
  return (
    <div className="h-[480px] w-[800px]">
      <TerminalPane
        threadId={props.threadId}
        status={thread.status}
        hidden
        {...(remoteTransport ? { remoteTransport } : {})}
      />
    </div>
  );
}
