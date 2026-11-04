import { msg } from "@lingui/core/macro";
import type { Thread } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost, type EntityHost } from "@/renderer/state/entityHost";
import { claimThreadNavigation, openThread } from "./threadActions";

function requireHost(thread: Thread): EntityHost {
  const host = entityHost(thread);
  if (!host) throw new Error(i18n._(msg`The source conversation is unavailable.`));
  return host;
}

export async function createThreadFork(input: {
  source: Thread;
  throughItemId?: string;
  title: string;
  threadId: string;
  commandId: string;
}): Promise<void> {
  const host = requireHost(input.source);
  const snapshot = await host.withClient(async (client) => {
    const environment = await client.environment();
    if (!environment.capabilities?.threadForks?.versions.includes(1)) {
      throw new Error(i18n._(msg`Update the host to fork conversations.`));
    }
    await client.sendThreadCommand(
      {
        kind: "fork",
        threadId: input.threadId,
        sourceThreadId: host.hostId,
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
  const fork = host.adoptThreadRow(snapshot.page.thread);
  openThread(fork.id, { reopenRuntime: false });
  useAppStore.getState().requestComposerFocus(fork.id);
}

export async function openThreadForkSource(fork: Thread): Promise<void> {
  if (!fork.forkedFrom) return;
  const host = requireHost(fork);
  const sourceId = host.hostThreadId(fork.forkedFrom.threadId);
  if (!sourceId) throw new Error(i18n._(msg`The source conversation is unavailable.`));
  const stillOwnsNavigation = claimThreadNavigation();
  const snapshot = await host.withClient((client) =>
    client.boundedThreadHistory(sourceId, {
      compactDetails: true,
      omitScrollback: true,
      noticesCapable: true,
    }),
  );
  if (!stillOwnsNavigation()) return;
  const source = host.adoptThreadRow(snapshot.page.thread);
  openThread(source.id, { reopenRuntime: false });
}
