import { msg } from "@lingui/core/macro";
import type { Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { applyRootCatalogThreadRows } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import {
  projectRemoteThread,
  remoteOwner,
  unprojectRemoteThreadId,
} from "@/renderer/state/remoteProjection";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { managedRootOfflineError } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { claimThreadNavigation, openThread } from "./threadActions";

function withThreadClient<Result>(
  thread: Thread,
  run: (client: RemoteDesktopClient) => Promise<Result>,
): Promise<Result> {
  const owner = remoteOwner(thread);
  if (owner) return useRemoteServersStore.getState().withClient(owner.desktopId, run);
  const client = readManagedLoopbackActivation()?.client;
  if (!client) throw managedRootOfflineError();
  return run(client);
}

function adoptThread(source: Thread, thread: Thread): Thread {
  const owner = remoteOwner(source);
  if (!owner) {
    applyRootCatalogThreadRows([thread], new Set());
    return thread;
  }
  const projected = projectRemoteThread(owner.desktopId, thread);
  useAppStore.setState((state) => ({
    threads: [...state.threads.filter((row) => row.id !== projected.id), projected],
  }));
  useRemoteServersStore.getState().scheduleServerRefresh(owner.desktopId);
  return projected;
}

export async function createThreadFork(input: {
  source: Thread;
  throughItemId?: string;
  title: string;
  threadId: string;
  commandId: string;
}): Promise<void> {
  const owner = remoteOwner(input.source);
  const snapshot = await withThreadClient(input.source, async (client) => {
    const environment = await client.environment();
    if (!environment.capabilities?.threadForks?.versions.includes(1)) {
      throw new Error(i18n._(msg`Update the host to fork conversations.`));
    }
    await client.sendThreadCommand(
      {
        kind: "fork",
        threadId: input.threadId,
        sourceThreadId: owner?.remoteId ?? input.source.id,
        ...(input.throughItemId ? { throughItemId: input.throughItemId } : {}),
        title: input.title,
      },
      { commandId: input.commandId },
    );
    return client.boundedThreadHistory(input.threadId, {
      compactDetails: true,
      omitScrollback: true,
      noticesCapable: true,
    });
  });
  const fork = adoptThread(input.source, snapshot.page.thread);
  openThread(fork.id, { reopenRuntime: false });
  useAppStore.getState().requestComposerFocus(fork.id);
}

export async function openThreadForkSource(fork: Thread): Promise<void> {
  if (!fork.forkedFrom) return;
  const owner = remoteOwner(fork);
  const sourceId = owner
    ? unprojectRemoteThreadId(owner.desktopId, fork.forkedFrom.threadId)
    : fork.forkedFrom.threadId;
  if (!sourceId) throw new Error(i18n._(msg`The source conversation is unavailable.`));
  const stillOwnsNavigation = claimThreadNavigation();
  const snapshot = await withThreadClient(fork, (client) =>
    client.boundedThreadHistory(sourceId, {
      compactDetails: true,
      omitScrollback: true,
      noticesCapable: true,
    }),
  );
  if (!stillOwnsNavigation()) return;
  const source = adoptThread(fork, snapshot.page.thread);
  openThread(source.id, { reopenRuntime: false });
}
