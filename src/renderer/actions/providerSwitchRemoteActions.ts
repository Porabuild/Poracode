import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  ExtractContextResult,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { remoteOwner, remoteThreadId } from "@/renderer/state/remoteProjection";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { markThreadDone } from "./threadActions";
import { buildHandoffLaunchInput } from "./providerHandoff";

/**
 * Continue a mirrored thread in a NEW thread on its host — the fork intent,
 * and any switch whose source or target is not chat/GUI (a terminal thread has
 * no place to keep the prior transcript, so the switch replaces the thread
 * instead of retargeting it). Mirrors the local replacement path in
 * `handleContinueInProvider`, but every durable step happens on the host:
 * the row is created optimistically as a projection, and the launch rides the
 * `start` thread command (which persists title/group server-side).
 */
export async function continueRemoteThreadInNewThread(input: {
  thread: Thread;
  targetAgentKind: string;
  targetConfig: ThreadConfig;
  targetPresentationMode: ThreadPresentationMode;
  prompt: string;
  segments: PromptSegment[] | undefined;
  extractedContext: ExtractContextResult | null;
  /** Inherited title — computed by the caller so the localized fork marker stays in one place. */
  title: string;
  /** Resolved by the caller (host statuses for a mirrored thread) for the success toast. */
  targetLabel: string;
  fork: boolean;
}): Promise<void> {
  const {
    thread,
    targetAgentKind,
    targetConfig,
    targetPresentationMode,
    extractedContext,
    title,
    targetLabel,
    fork,
  } = input;
  if (findExperimentByThreadId(thread.id)) return;
  const owner = remoteOwner(thread);
  if (!owner) return;
  // Everything below goes over the host connection; bail before painting rows
  // the next snapshot would contradict.
  if (isRemoteProjectUnreachable(thread)) {
    toast.danger(
      i18n._(msg`This project's remote server is offline. Reconnect it to start a thread.`),
    );
    return;
  }

  const hostThreadId = crypto.randomUUID();
  const projectedId = remoteThreadId(owner.desktopId, hostThreadId);
  const store = useAppStore.getState();
  const project = store.projects.find((p) => p.id === thread.projectId);
  if (!project) return;
  // The launch targets the host PROJECT; the thread's remoteId is a host
  // thread id and would miss the host's project lookup entirely.
  const projectOwner = remoteOwner(project);
  if (!projectOwner || projectOwner.desktopId !== owner.desktopId) return;

  // Fork only: a fork sits beside its source in one group. Assign the source
  // locally and on the host row (the projected row's group follows via the
  // snapshot; without the command the host row would strip it).
  let groupId = thread.groupId;
  let groupName = thread.groupName;
  if (fork) {
    groupId = thread.groupId ?? crypto.randomUUID();
    groupName = thread.groupName ?? thread.title;
    if (!thread.groupId) {
      useAppStore.setState((state) => ({
        threads: state.threads.map((t) => (t.id === thread.id ? { ...t, groupId, groupName } : t)),
      }));
      void useRemoteServersStore
        .getState()
        .sendThreadCommand(owner.desktopId, {
          kind: "set-group",
          threadId: owner.remoteId,
          groupId,
          groupName,
        })
        .catch((error) => toast.danger(friendlyError(error)));
    }
  }

  store.createThread({
    threadId: projectedId,
    projectId: project.id,
    agentKind: targetAgentKind,
    config: targetConfig,
    prompt: input.prompt,
    title,
    presentationMode: targetPresentationMode,
    ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
    ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
    remoteServerId: owner.desktopId,
    remoteId: hostThreadId,
    ...(groupId ? { groupId } : {}),
    ...(groupName ? { groupName } : {}),
  });

  // The handoff summary is saved under the NEW thread id: the owner-routed
  // bridge uploads it to the host and returns a host path, which is what the
  // segments must reference when the host launches the replacement.
  const launch = await buildHandoffLaunchInput({
    threadId: projectedId,
    prompt: input.prompt,
    segments: input.segments,
    extractedContext,
  });

  try {
    const result = await useRemoteServersStore.getState().launchRemoteThread({
      desktopId: owner.desktopId,
      threadId: hostThreadId,
      projectId: projectOwner.remoteId,
      agentKind: targetAgentKind,
      config: targetConfig,
      prompt: launch.prompt,
      ...(launch.segments ? { segments: launch.segments } : {}),
      presentationMode: targetPresentationMode,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
      title,
      ...(groupId ? { groupId } : {}),
      ...(groupName ? { groupName } : {}),
    });
    if (result !== "started") {
      // The launch never reached the host — don't leave an optimistic row
      // pointing at a session that will never exist.
      useAppStore.getState().deleteThread(projectedId);
      return;
    }
    toast.success(
      extractedContext
        ? i18n._(msg`Context transferred to ${targetLabel}`)
        : i18n._(msg`Started ${targetLabel} thread`),
    );
    if (fork) {
      // `launchRemoteThread` focuses the new thread; bring the source back
      // beside it the way the local fork does.
      useAppStore.getState().openThreadSideBySide(thread.id);
    }
  } catch (error) {
    useAppStore.getState().deleteThread(projectedId);
    toast.danger(friendlyError(error));
    return;
  }

  if (!fork) {
    markThreadDone(thread.id);
  }
}
