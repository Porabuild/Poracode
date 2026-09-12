import { readBridge } from "@/renderer/bridge";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { watchRoutedTerminal } from "@/renderer/state/remoteTerminalFeed";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useThread } from "@/renderer/state/useThread";
import type { RemoteTerminalTransport } from "./TerminalPane";

/** PTY I/O for a thread whose agent process lives on a paired desktop. */
export function useRemoteTerminalTransport(threadId: string): RemoteTerminalTransport | undefined {
  const thread = useThread(threadId);
  const openRemoteThread = useRemoteServersStore((state) => state.openThread);
  const owner = remoteOwner(thread);
  const remoteDesktopId = owner?.desktopId;
  const remoteThreadId = owner?.remoteId;
  if (!remoteDesktopId || !remoteThreadId) return undefined;
  return {
    initialScrollback:
      openRemoteThread?.desktopId === remoteDesktopId &&
      openRemoteThread.threadId === remoteThreadId
        ? (openRemoteThread.terminalScrollback ?? "")
        : "",
    outputSource: (listener) => watchRoutedTerminal(remoteThreadId, listener, remoteDesktopId),
    writeInput: (data: string) => readBridge().writeTerminal({ threadId, data }),
    resizeBackingTerminal: (size) => readBridge().resizeTerminal({ threadId, ...size }),
  };
}
