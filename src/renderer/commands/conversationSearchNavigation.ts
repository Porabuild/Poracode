import { create } from "zustand";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import { i18n } from "@/renderer/i18n/i18n";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { claimThreadNavigation, openThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { entityHost } from "@/renderer/state/entityHost";
import { readHostThreadExistence } from "@/renderer/state/hostThreadLaunch";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import type { ConversationSearchHit, ConversationSearchSource } from "./useConversationSearch";

interface SearchTarget {
  threadId: string;
  itemId: string;
  source: ConversationSearchSource;
}
export const useConversationSearchTarget = create<{ target: SearchTarget | null }>(() => ({
  target: null,
}));

export function isConversationSearchTargetCurrent(target: SearchTarget): boolean {
  if (useConversationSearchTarget.getState().target !== target) return false;
  const source = target.source;
  return source.kind === "managed"
    ? readManagedLoopbackActivation()?.seq === source.activationSeq
    : currentRemoteServerGeneration(source.connectionKey) === source.generation;
}

export async function openConversationSearchHit(hit: ConversationSearchHit): Promise<void> {
  const target = {
    threadId:
      hit.source.kind === "managed"
        ? hit.threadId
        : remoteThreadId(hit.source.connectionKey, hit.threadId),
    itemId: hit.itemId,
    source: hit.source,
  };
  useConversationSearchTarget.setState({ target });
  try {
    if (!isConversationSearchTargetCurrent(target)) throw new Error();
    const navigationCurrent = claimThreadNavigation();
    const viewAtStart = useAppStore.getState().view;
    const pendingAtStart = useAppStore.getState().pendingActiveThreadId;
    const stillCurrent = () => {
      if (useConversationSearchTarget.getState().target !== target) return false;
      if (
        navigationCurrent() &&
        isConversationSearchTargetCurrent(target) &&
        useAppStore.getState().view === viewAtStart &&
        useAppStore.getState().pendingActiveThreadId === pendingAtStart
      )
        return true;
      useConversationSearchTarget.setState({ target: null });
      return false;
    };
    // The hit's host, whichever host that is. Old or unopened rows can be
    // outside the bounded resident catalog: read the row back from that host,
    // then open it like any thread (its pane reads its history).
    const host = entityHost(
      hit.source.kind === "managed"
        ? { id: target.threadId }
        : {
            id: target.threadId,
            remoteServerId: hit.source.connectionKey,
            remoteId: hit.threadId,
          },
    );
    if (!host) throw new Error();
    if (!useAppStore.getState().threads.some((thread) => thread.id === target.threadId)) {
      const existence = await readHostThreadExistence(host, target.threadId);
      if (!stillCurrent()) return;
      if (existence !== "present") throw new Error();
    }
    if (!stillCurrent()) return;
    openThread(target.threadId, {
      focusComposer: false,
      switchWorkspace: true,
      reopenRuntime: false,
      standalone: true,
    });
    // Once handed to the pane, a later navigation must retire this jump even
    // when the destination has not mounted or finished its initial read yet.
    const stopAppWatch = useAppStore.subscribe((state, previous) => {
      if (
        (state.pendingActiveThreadId !== null && state.pendingActiveThreadId !== target.threadId) ||
        (state.view !== previous.view &&
          (state.view.kind !== "thread" || !state.view.panes.includes(target.threadId))) ||
        (state.threads !== previous.threads &&
          !state.threads.some((thread) => thread.id === target.threadId))
      )
        useConversationSearchTarget.setState({ target: null });
    });
    const retireReplacedSource = () => {
      if (
        useConversationSearchTarget.getState().target === target &&
        !isConversationSearchTargetCurrent(target)
      )
        useConversationSearchTarget.setState({ target: null });
    };
    const stopSourceWatch =
      target.source.kind === "managed"
        ? subscribeManagedLoopbackActivation(retireReplacedSource)
        : useRemoteServersStore.subscribe(retireReplacedSource);
    const stopTargetWatch = useConversationSearchTarget.subscribe((state) => {
      if (state.target !== target) {
        stopAppWatch();
        stopSourceWatch();
        stopTargetWatch();
      }
    });
  } catch {
    if (useConversationSearchTarget.getState().target !== target) return;
    useConversationSearchTarget.setState({ target: null });
    toast.warning(i18n._(msg`The matched conversation could not be opened.`));
  }
}
