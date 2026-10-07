import { sidebarThreadChoices } from "./sidebarChoices";
import { installSidebarAutoConnect } from "./autoConnect";
import { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { isHomeProject } from "@/shared/homeScope";
import { ChatSidebarHeader } from "./ChatSidebarHeader";
import { installSidebarAgentReadiness } from "./agentReadiness";
import { useAppStore } from "@/renderer/state/appStore";
import {
  useRemoteServersStore,
  selectBrowserBridgeServer,
} from "@/renderer/state/remoteServersStore";
import { useRemoteServerConnection } from "@/renderer/hooks/useRemoteServerConnection";
import { CompactDndProvider } from "@/renderer/dnd";
import { ThreadPane } from "@/renderer/views/MainView/parts/AppContent/parts/ThreadPane";
import { BrowserRemoteConnectionGate } from "@/renderer/views/MainView/parts/BrowserRemoteConnectionGate";
import { ChatSidebarDraft } from "./ChatSidebarDraft";
import { ImplicitMcpServersContext } from "@/renderer/components/composer/implicitMcpServers";
import type { BuiltInMcpServerId } from "@/shared/contracts";
import { useRestoredRemoteThreadLifecycle } from "@/renderer/hooks/useRestoredRemoteThreadLifecycle";
import { TurnClientContextSource } from "@/renderer/components/composer/turnClientContext";
import { createBrowserFocusCapture } from "./browserFocusContext";

const BROWSER_TOOLS: readonly BuiltInMcpServerId[] = ["chrome"];
/** Every send from this surface tells the agent which tab the user is on. */
const captureBrowserFocus = createBrowserFocusCapture();

/** A client of the same server and chat surface, with one visible conversation. */
export function ChatSidebarView() {
  const { checked, initialConnectSettled } = useRemoteServerConnection({ autoConnect: false });
  const [autoError, setAutoError] = useState<"upgradeRequired" | "connection" | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(0);
  useRestoredRemoteThreadLifecycle(checked);
  const server = useRemoteServersStore(selectBrowserBridgeServer);
  const serverKey = server?.connectionId ?? server?.desktopId;
  useEffect(() => (serverKey ? installSidebarAgentReadiness(serverKey) : undefined), [serverKey]);
  const threads = useAppStore((state) => sidebarThreadChoices(state.threads, serverKey));
  const projectId = useAppStore(
    (state) =>
      state.projects.find(
        (project) => project.remoteServerId === serverKey && isHomeProject(project),
      )?.id,
  );
  const selectedId = useAppStore((state) =>
    state.view.kind === "thread" ? state.view.panes[0] : undefined,
  );
  const selected = threads.find((thread) => thread.id === selectedId);
  const newChat = () => {
    if (projectId) {
      useAppStore.getState().discardDraftContent(projectId);
      setDraftEpoch((epoch) => epoch + 1);
      useAppStore.getState().openDraft(projectId);
    }
  };

  useEffect(() => {
    if (!initialConnectSettled) return;
    return installSidebarAutoConnect((error) =>
      setAutoError(
        error === null ? null : error === "upgradeRequired" ? "upgradeRequired" : "connection",
      ),
    );
  }, [initialConnectSettled]);

  return (
    <ImplicitMcpServersContext value={BROWSER_TOOLS}>
      <TurnClientContextSource value={captureBrowserFocus}>
        <CompactDndProvider>
          <div
            data-chat-sidebar=""
            className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground"
          >
            <ChatSidebarHeader
              threads={threads}
              selected={selected}
              onNewChat={newChat}
              isDisabled={!server || !projectId}
            />
            <BrowserRemoteConnectionGate
              checkingConnection={!checked}
              fallback={
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
                  <p className="text-sm text-muted">
                    {autoError === "upgradeRequired" ? (
                      <Trans>Update Poracode to use browser chats.</Trans>
                    ) : (
                      <Trans>Start Poracode to chat in your browser.</Trans>
                    )}
                  </p>
                  {autoError === "connection" ? (
                    <p role="alert" className="text-sm text-muted">
                      <Trans>Unable to connect. Retrying…</Trans>
                    </p>
                  ) : null}
                </div>
              }
            >
              <main className="min-h-0 flex-1">
                {selected ? (
                  <ThreadPane
                    key={selected.id}
                    threadId={selected.id}
                    paneCount={1}
                    paneAlign="center"
                    chatOnly
                    onClose={newChat}
                  />
                ) : projectId ? (
                  <ChatSidebarDraft key={`${serverKey}:${draftEpoch}`} projectId={projectId} />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Spinner size="sm" />
                  </div>
                )}
              </main>
            </BrowserRemoteConnectionGate>
          </div>
        </CompactDndProvider>
      </TurnClientContextSource>
    </ImplicitMcpServersContext>
  );
}
