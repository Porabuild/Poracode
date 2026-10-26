import { msg } from "@lingui/core/macro";
import { DEFAULT_TERMINAL_SIZE, type Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { resolveProjectLocation } from "@/shared/worktree";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import {
  markThreadLaunchFailed,
  performInitialThreadLaunch,
} from "@/renderer/actions/threadLaunchActions";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner, remoteThreadId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { PrAskLaunchError } from "./prAskLaunchError";
import type { PrAskAgentSelection } from "./resolvePrAskAgent";

export interface PrAskLaunchInput {
  project: Project;
  selection: PrAskAgentSelection;
  title: string;
  prompt: string;
  /** The pull request's local checkout; the project root when absent. */
  worktreePath?: string | undefined;
  /** Relaunch this row instead of creating another (retry after a failed launch). */
  existingThreadId?: string | undefined;
  /** Called with the thread id before its row is published, so the caller can hide it first. */
  reserve: (threadId: string) => void;
}

/**
 * The optimistic first message a previous launch attempt painted into the row. A
 * retry must reuse its id: the launch otherwise paints the same prompt a second time.
 */
function paintedInitialUserMessageId(threadId: string): string | undefined {
  const items = useAppStore.getState().runtimeItemsByIdByThread[threadId];
  return Object.values(items ?? {}).find((item) => item.type === "user_message")?.id;
}

/**
 * Creates a GUI project thread for a pull-request chat and launches it with its
 * first prompt through the same launch actions every thread uses, so the
 * supervisor (never the renderer) starts the agent. The row is added without
 * taking focus. Resolves with the thread id once the host has accepted the launch.
 */
export async function launchPrAskThread(input: PrAskLaunchInput): Promise<string> {
  const { project, selection, prompt } = input;
  const store = useAppStore.getState();
  const owner = remoteOwner(project);
  const existing = input.existingThreadId
    ? store.threads.find((row) => row.id === input.existingThreadId)
    : undefined;
  const hostThreadId = existing
    ? (remoteOwner(existing)?.remoteId ?? existing.id)
    : crypto.randomUUID();
  const threadId = existing
    ? existing.id
    : owner
      ? remoteThreadId(owner.desktopId, hostThreadId)
      : hostThreadId;
  const retainedMessageId = existing ? paintedInitialUserMessageId(existing.id) : undefined;
  // Reserve the id before the row exists, so sidebar subscribers never see it.
  input.reserve(threadId);
  const thread =
    existing ??
    store.createThread({
      threadId,
      ...(owner ? { remoteServerId: owner.desktopId, remoteId: hostThreadId } : {}),
      projectId: project.id,
      agentKind: selection.agentKind,
      config: selection.config,
      prompt,
      title: input.title,
      presentationMode: "gui",
      focus: false,
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
    });
  try {
    if (owner) {
      const result = await useRemoteServersStore.getState().launchRemoteThread(
        {
          desktopId: owner.desktopId,
          threadId: hostThreadId,
          projectId: owner.remoteId,
          agentKind: thread.agentKind,
          config: thread.config,
          prompt,
          presentationMode: "gui",
          title: thread.title,
          ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
        },
        {
          focus: false,
          isPendingLaunchOwned: () =>
            useAppStore.getState().threads.some((row) => row.id === thread.id),
        },
      );
      if (result !== "started") throw new Error(i18n._(msg`The launch was cancelled.`));
    } else {
      await performInitialThreadLaunch({
        thread,
        projectLocation: resolveProjectLocation(project.location, thread.worktreePath),
        prompt,
        // A retried row already shows the first message: reuse it, never paint it twice.
        ...(existing && retainedMessageId ? { userMessageItemId: retainedMessageId } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
      });
    }
    return thread.id;
  } catch (error) {
    const uncertain = isRemoteCommandOutcomeUncertainError(error);
    if (!uncertain && useAppStore.getState().threads.some((row) => row.id === thread.id))
      markThreadLaunchFailed(thread.id, error);
    throw new PrAskLaunchError(friendlyError(error), thread.id, uncertain);
  }
}
