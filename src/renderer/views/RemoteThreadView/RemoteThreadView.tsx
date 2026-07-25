import { useCallback, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2, Send, Square, X } from "lucide-react";
import { isThreadTurnActive } from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { ChatPane } from "@/renderer/components/thread/ChatPane/ChatPane";
import { XTermSurface } from "@/renderer/components/terminal/XTermSurface";
import { normalizeChatProjectPath } from "@/renderer/components/thread/ChatPane/chatPathUtils";
import { ThreadRuntimeRequestPanel } from "@/renderer/components/thread/ThreadRuntimeRequestPanel/ThreadRuntimeRequestPanel";
import { getApprovalDenyOption } from "@/renderer/components/thread/ThreadRuntimeRequestPanel/helpers";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { applyOptimisticRequestResolution } from "@/renderer/state/runtimeRequestActions";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { watchRemoteTerminal } from "@/renderer/state/remoteTerminalFeed";

function isAbsoluteFilePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

function remoteRootLabel(projectName: string, worktreePath: string | undefined): string {
  if (!worktreePath) return projectName;
  return worktreePath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectName;
}

function RemoteTerminalPane(props: {
  readonly threadId: string;
  readonly initialScrollback: string;
}) {
  const writeRemoteTerminal = useRemoteServersStore((state) => state.writeRemoteTerminal);
  const resizeRemoteTerminal = useRemoteServersStore((state) => state.resizeRemoteTerminal);
  const outputSource = useCallback(
    (listener: {
      onOutput: (data: string) => void;
      onReset: () => void;
      onExited: (exitCode: number | null) => void;
    }) => watchRemoteTerminal(props.threadId, listener),
    [props.threadId],
  );

  return (
    <XTermSurface
      key={props.threadId}
      terminalId={props.threadId}
      className="h-full w-full"
      initialScrollback={props.initialScrollback}
      outputSource={outputSource}
      writeInput={writeRemoteTerminal}
      resizeBackingTerminal={resizeRemoteTerminal}
      openLinksInNativeBrowser
    />
  );
}

/**
 * Live-chat surface for a thread running on a *remote* server (desktop-as-client;
 * docs/REMOTE_ARCHITECTURE.md, Phase 4). The remote thread's history + live
 * events are hydrated into the shared, threadId-keyed runtime store
 * (`openRemoteThread`), so it reuses the desktop's `ChatPane` for rendering. The
 * composer and interrupt route to the remote server via the remote client.
 */
export function RemoteThreadView() {
  const { t } = useLingui();
  const open = useRemoteServersStore((s) => s.openThread);
  const servers = useRemoteServersStore((s) => s.servers);
  const runtime = useRemoteServersStore((s) => (open ? s.runtime[open.desktopId] : undefined));
  const sendRemotePrompt = useRemoteServersStore((s) => s.sendRemotePrompt);
  const closeRemoteThread = useRemoteServersStore((s) => s.closeRemoteThread);
  const interruptThread = useRemoteServersStore((s) => s.interruptThread);
  const resolveThreadRequest = useRemoteServersStore((s) => s.resolveThreadRequest);
  const rollbackThreadConversation = useRemoteServersStore((s) => s.rollbackThreadConversation);
  const restoreFileCheckpoint = useRemoteServersStore((s) => s.restoreFileCheckpoint);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Live turn state from the runtime store (updated by streamed WS events), so
  // the Interrupt button reflects the agent's *current* state rather than the
  // status captured in the opening snapshot. Falls back to the snapshot status.
  const openTurn = useAppStore((s) =>
    open ? s.runtimeOpenTurnByThread[open.threadId] : undefined,
  );
  const activeRuntimeRequest = useAppStore((s) =>
    open ? s.runtimeRequestsByThread[open.threadId]?.[0] : undefined,
  );

  if (!open) return null;
  const server = servers.find((entry) => entry.desktopId === open.desktopId);
  // Prefer the live thread from the refreshed runtime snapshot over the one
  // captured when the overlay opened: the model/mode/status may have changed on
  // the remote (or PWA) since. `open.thread` is the fallback if it's not (yet) in
  // the snapshot. This keeps ChatPane's config + status fresh (see finding #4).
  const thread = runtime?.threads.find((entry) => entry.id === open.threadId) ?? open.thread;
  const active = openTurn ?? isThreadTurnActive(thread.status);
  const project = runtime?.projects.find((entry) => entry.id === thread.projectId);
  const checkpointProjectLocation = project
    ? thread.worktreePath
      ? buildWorktreeLocation(project.location, thread.worktreePath)
      : project.location
    : undefined;
  const remotePaneActions =
    project && checkpointProjectLocation
      ? {
          openProjectRelativePath: async (path: string, lineNumber?: number) => {
            const normalized = normalizeChatProjectPath(path, checkpointProjectLocation);
            if (isAbsoluteFilePath(normalized)) return;
            const fileEditor = useFileEditorStore.getState();
            fileEditor.setRootContext({
              projectId: project.id,
              projectName: project.name,
              projectLocation: checkpointProjectLocation,
              rootLabel: remoteRootLabel(project.name, thread.worktreePath),
              ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
              remoteServerId: open.desktopId,
            });
            await fileEditor.openFile(
              normalized,
              "modal",
              false,
              lineNumber !== undefined ? { lineNumber } : undefined,
            );
          },
          revealProjectFolderInTree: () => {},
          onContentHeightChange: () => {},
          projectLocation: checkpointProjectLocation,
        }
      : undefined;
  const approvalDenyOption = activeRuntimeRequest
    ? getApprovalDenyOption(activeRuntimeRequest)
    : undefined;
  const terminalPresentation = (thread.presentationMode ?? "terminal") === "terminal";

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setDraft("");
    const denyPendingApproval = () => {
      if (!activeRuntimeRequest || !approvalDenyOption) return Promise.resolve();
      const rollback = applyOptimisticRequestResolution(
        open.threadId,
        activeRuntimeRequest,
        "declined",
      );
      return resolveThreadRequest({
        desktopId: open.desktopId,
        threadId: open.threadId,
        requestId: activeRuntimeRequest.requestId,
        method: "requestPermission",
        response: { optionId: approvalDenyOption.optionId },
      }).catch((error) => {
        rollback();
        throw error;
      });
    };
    void denyPendingApproval()
      .then(() => sendRemotePrompt(prompt))
      .catch((error) => {
        console.error("[remote-thread] failed to send prompt", error);
        setDraft(prompt);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{thread.title}</span>
          <span className="truncate text-xs text-muted">{server?.label ?? t`Remote server`}</span>
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => void interruptThread(open.desktopId, open.threadId)}
          >
            <Square className="size-4" />
            <Trans>Interrupt</Trans>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t`Close`}
          onPress={() => closeRemoteThread()}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {terminalPresentation ? (
          <RemoteTerminalPane
            threadId={open.threadId}
            initialScrollback={open.terminalScrollback ?? ""}
          />
        ) : (
          <ChatPane
            thread={thread}
            paneActionsOverride={remotePaneActions}
            checkpointProjectLocation={checkpointProjectLocation}
            checkpointActions={{
              rollbackThreadConversation: (input) =>
                rollbackThreadConversation({
                  desktopId: open.desktopId,
                  ...input,
                }),
              restoreFileCheckpoint: (input) =>
                restoreFileCheckpoint({
                  desktopId: open.desktopId,
                  ...input,
                }),
            }}
          />
        )}
      </div>

      {!terminalPresentation ? (
        <div className="border-t border-[var(--hairline)] p-3">
          {activeRuntimeRequest ? (
            <div className="mb-3">
              <ThreadRuntimeRequestPanel
                key={activeRuntimeRequest.requestId}
                threadId={open.threadId}
                request={activeRuntimeRequest}
                onResolve={(input) =>
                  resolveThreadRequest({
                    desktopId: open.desktopId,
                    threadId: open.threadId,
                    ...input,
                  })
                }
              />
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-md border border-default-200 bg-default-50 px-3 py-2 text-sm text-foreground outline-none focus:border-default-400"
              value={draft}
              placeholder={t`Message the remote agent…`}
              rows={1}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              isDisabled={busy || !draft.trim()}
              aria-label={t`Send`}
              onPress={submit}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
