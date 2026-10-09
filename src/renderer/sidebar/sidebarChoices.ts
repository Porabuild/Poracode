import type { Thread } from "@/shared/contracts";
import { createArrayKeyedMap } from "@/renderer/state/derivations";

export type SidebarChatChoice = {
  id: string;
  title: string;
  projectId: string;
  remoteServerId: string | undefined;
  updatedAt: string;
};

const EMPTY_CHOICES: SidebarChatChoice[] = [];

/** Non-archived GUI chats grouped by server, most recent first. */
function groupGuiChoicesByRemoteServer(threads: Thread[]) {
  const byServer = new Map<string | undefined, SidebarChatChoice[]>();
  for (const thread of threads) {
    if (thread.presentationMode !== "gui" || thread.archived || thread.archivedAt) continue;
    const { id, title, projectId, remoteServerId, updatedAt } = thread;
    const choice = { id, title, projectId, remoteServerId, updatedAt };
    const choices = byServer.get(remoteServerId);
    if (choices) choices.push(choice);
    else byServer.set(remoteServerId, [choice]);
  }
  for (const choices of byServer.values()) {
    choices.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return byServer;
}

const getSidebarChoices = createArrayKeyedMap(groupGuiChoicesByRemoteServer);

/** Stable for an unchanged `threads` array, so it can be returned from a store selector. */
export function sidebarThreadChoices(
  threads: Thread[],
  serverKey: string | undefined,
): SidebarChatChoice[] {
  return getSidebarChoices(threads, serverKey) ?? EMPTY_CHOICES;
}
