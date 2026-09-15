import type { AppView, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";

function withoutGroup(thread: Thread): Thread {
  const { groupId: _groupId, groupName: _groupName, ...rest } = thread;
  return rest;
}

/**
 * Mirror a remote `set-group` command into the desktop store. Passing no
 * groupId removes the thread from its sidebar group and dissolves a leftover
 * pair so a two-thread group cannot linger as a singleton.
 */
export function applyRemoteSetGroupCommand(
  threadId: string,
  groupId: string | undefined,
  groupName: string | undefined,
): void {
  useAppStore.setState((state) => {
    const target = state.threads.find((thread) => thread.id === threadId);
    if (!target) return {};
    if (groupId) {
      return {
        threads: state.threads.map((thread) =>
          thread.id === threadId ? { ...thread, groupId, groupName: groupName ?? groupId } : thread,
        ),
      };
    }
    const previousGroupId = target.groupId;
    let threads = state.threads.map((thread) =>
      thread.id === threadId ? withoutGroup(thread) : thread,
    );
    if (previousGroupId) {
      const leftover = threads.filter((thread) => thread.groupId === previousGroupId);
      if (leftover.length === 1) {
        const leftoverId = leftover[0]!.id;
        threads = threads.map((thread) =>
          thread.id === leftoverId ? withoutGroup(thread) : thread,
        );
      }
    }
    let view: AppView = state.view;
    if (view.kind === "thread" && previousGroupId && view.activeGroupId === previousGroupId) {
      view = { kind: "thread", panes: [view.panes[0]] };
    }
    return { threads, view };
  });
}
