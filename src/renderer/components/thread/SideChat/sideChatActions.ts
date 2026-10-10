import { auxiliaryThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
import { msg } from "@lingui/core/macro";
import {
  TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH,
  type PromptSegment,
  type ThreadPresentationMode,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { readBridge } from "@/renderer/bridge";
import { handoffTranscriptBudget } from "@/renderer/actions/handoffTranscript";
import { useAppStore } from "@/renderer/state/appStore";
import { readSideChatContext } from "./sideChatContext";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { REMOTE_CONVERSATION_SNAPSHOTS_VERSION } from "@/shared/remote/protocol";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSideChatPanelStore } from "./sideChatPanelStore";

function canOpenSideChat(threadId: string): boolean {
  return (
    typeof readBridge().openSideChatPanel === "function" && !auxiliaryThreadIds().has(threadId)
  );
}

/** Menu and slash-command availability follow the active presentation surface. */
export function sideChatAvailable(
  threadId: string,
  presentationMode: ThreadPresentationMode,
): boolean {
  return presentationMode === "gui" && canOpenSideChat(threadId);
}

const opening = new Map<string, Promise<boolean>>();

/** The + menu reopens a retained conversation; /btw starts a fresh one. */
export async function showSideChat(sourceThreadId: string): Promise<boolean> {
  const entry = useSideChatPanelStore.getState().entry;
  if (entry?.source.id === sourceThreadId && canOpenSideChat(sourceThreadId)) {
    usePanelStore.getState().setRightPanelTab("sideChat");
    return true;
  }
  return openSideChat(sourceThreadId);
}

export async function openSideChat(
  sourceThreadId: string,
  prompt = "",
  segments?: PromptSegment[],
): Promise<boolean> {
  const existing = opening.get(sourceThreadId);
  if (existing) return false;
  const promise = performOpen(sourceThreadId, prompt, segments);
  opening.set(sourceThreadId, promise);
  try {
    return await promise;
  } finally {
    if (opening.get(sourceThreadId) === promise) opening.delete(sourceThreadId);
  }
}

async function performOpen(
  sourceThreadId: string,
  prompt: string,
  segments?: PromptSegment[],
): Promise<boolean> {
  const source = useAppStore.getState().threads.find((thread) => thread.id === sourceThreadId);
  const open = readBridge().openSideChatPanel;
  if (!source || source.presentationMode !== "gui" || !open || !canOpenSideChat(sourceThreadId))
    return false;
  const owner = remoteOwner(source);
  if (owner) {
    const supported = await useRemoteServersStore
      .getState()
      .withClient(
        owner.desktopId,
        async (client) =>
          (await client.environment()).capabilities?.conversationSnapshots?.versions.includes(
            REMOTE_CONVERSATION_SNAPSHOTS_VERSION,
          ) === true,
      );
    if (!supported)
      throw new Error(i18n._(msg`Update the remote host to use side chat with hidden context.`));
  }
  const title = i18n._(msg`Side chat: ${source.title}`);
  const snapshot = structuredClone(source);
  let context;
  try {
    context = await readSideChatContext(
      snapshot,
      Math.min(
        handoffTranscriptBudget(snapshot.config.contextSize),
        TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH,
      ),
    );
  } catch (cause) {
    throw new Error(i18n._(msg`Could not read the thread context for side chat. Try again.`), {
      cause,
    });
  }
  await open({
    source: snapshot,
    title,
    context,
    prompt,
    autoStart: prompt.trim().length > 0,
    ...(segments ? { segments: structuredClone(segments) } : {}),
  });
  return true;
}
