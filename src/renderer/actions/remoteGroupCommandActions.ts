import type { AppView } from "@/shared/contracts";
import { canChangeThreadGroup, dissolveGroupMembership } from "@/shared/threadGroups";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useAppStore } from "@/renderer/state/appStore";

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
    if (!target) return state;
    const experiments = useExperimentStore.getState().experiments;
    if (!canChangeThreadGroup(target.groupId, groupId, (id) => experiments[id] !== undefined))
      return state;
    if (groupId) {
      return {
        threads: state.threads.map((thread) =>
          thread.id === threadId ? { ...thread, groupId, groupName: groupName ?? groupId } : thread,
        ),
      };
    }
    const previousGroupId = target.groupId;
    const { threads } = dissolveGroupMembership(state.threads, threadId);
    let view: AppView = state.view;
    if (view.kind === "thread" && previousGroupId && view.activeGroupId === previousGroupId) {
      view = { kind: "thread", panes: [view.panes[0]] };
    }
    return { threads, view };
  });
}
