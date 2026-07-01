import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2, Send, Square, X } from "lucide-react";
import { isThreadTurnActive } from "@/shared/contracts";
import { ChatPane } from "@/renderer/components/thread/ChatPane/ChatPane";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

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
  const sendRemotePrompt = useRemoteServersStore((s) => s.sendRemotePrompt);
  const closeRemoteThread = useRemoteServersStore((s) => s.closeRemoteThread);
  const interruptThread = useRemoteServersStore((s) => s.interruptThread);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Live turn state from the runtime store (updated by streamed WS events), so
  // the Interrupt button reflects the agent's *current* state rather than the
  // status captured in the opening snapshot. Falls back to the snapshot status.
  const openTurn = useAppStore((s) =>
    open ? s.runtimeOpenTurnByThread[open.threadId] : undefined,
  );

  if (!open) return null;
  const server = servers.find((entry) => entry.desktopId === open.desktopId);
  const active = openTurn ?? isThreadTurnActive(open.thread.status);

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setDraft("");
    void sendRemotePrompt(prompt).finally(() => setBusy(false));
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{open.thread.title}</span>
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
        <ChatPane thread={open.thread} />
      </div>

      <div className="border-t border-[var(--hairline)] p-3">
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
    </div>
  );
}
