import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { DEFAULT_TERMINAL_SIZE, type PromptSegment } from "@/shared/contracts";
import { resolveProjectLocation } from "@/shared/worktree";
import { friendlyError } from "@/shared/messages";
import { sideChatLaunchInput } from "./sideChatLaunchInput";
import {
  performInitialThreadLaunch,
  markThreadLaunchFailed,
} from "@/renderer/actions/threadLaunchActions";
import {
  openThread,
  reopenStoredThread,
  unloadStoredThread,
} from "@/renderer/actions/threadActions";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { useAppStore } from "@/renderer/state/appStore";
import {
  auxiliaryThreadIds,
  retainAuxiliaryThreadId,
} from "@/renderer/state/auxiliaryThreadWindows";
import { updateSideChatPanelDraft } from "./sideChatPanelStore";
import {
  claimSideChatLaunch,
  isSideChatLaunching,
  useSideChatLaunchState,
} from "./sideChatLaunchState";
import { readBridge } from "@/renderer/bridge";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import {
  remoteOwner,
  remoteThreadId,
  unprojectRemoteThreadId,
} from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";

export function useSideChatSession(entry: SideChatBootstrap, surface: "panel" | "window") {
  const { t } = useLingui();
  // Submission belongs to the opening request, never to subsequently typed drafts.
  const openingRequest = useRef(entry);
  const [prompt, setPromptState] = useState(entry.prompt);
  const latestPrompt = useRef(prompt);
  function setPrompt(value: string) {
    latestPrompt.current = value;
    setPromptState(value);
    if (surface === "panel") updateSideChatPanelDraft(entry.id, value);
  }
  const [threadId, setThreadId] = useState<string>();
  const ownedThreadId = useRef(entry.existingThreadId);
  const [observedThreadId, setObservedThreadId] = useState(entry.existingThreadId);
  const project = useProject(entry.source.projectId);
  const restoredThread = useThread(observedThreadId);
  const restoredOnce = useRef(false);
  const releaseWindow = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!restoredThread?.sessionRef || restoredOnce.current) return;
    restoredOnce.current = true;
    setThreadId(restoredThread.id);
    releaseWindow.current?.();
    releaseWindow.current = retainAuxiliaryThreadId(restoredThread.id);
    if (surface === "window") void openThread(restoredThread.id, { focusComposer: true });
    else {
      void hydrateThreadRuntimeItems(restoredThread.id);
      reopenStoredThread(restoredThread.id);
    }
  }, [restoredThread, surface]);
  const [launchError, setLaunchError] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const [starting, setStarting] = useState(false);
  const launching = useSideChatLaunchState(
    (state) => observedThreadId !== undefined && state.threadIds.has(observedThreadId),
  );
  const busy = starting || launching;
  const inFlight = useRef(false);
  const closed = useRef(false);

  useEffect(() => {
    const retire = () => {
      closed.current = true;
      releaseWindow.current?.();
      if (!ownedThreadId.current) {
        void readBridge()
          .bindSideChatThread?.({
            ...(entry.id ? { id: entry.id } : {}),
            prompt: latestPrompt.current,
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", retire);
    return () => {
      retire();
      window.removeEventListener("pagehide", retire);
    };
  }, [entry.id]);

  async function start(question: string, segments?: PromptSegment[]) {
    if (
      inFlight.current ||
      isSideChatLaunching(ownedThreadId.current) ||
      closed.current ||
      !question.trim()
    )
      return;
    if (!project) return;
    inFlight.current = true;
    setStarting(true);
    setLaunchError(undefined);
    const owner = remoteOwner(entry.source);
    const hostThreadId =
      owner && ownedThreadId.current
        ? (unprojectRemoteThreadId(owner.desktopId, ownedThreadId.current) ?? crypto.randomUUID())
        : crypto.randomUUID();
    const existing = ownedThreadId.current
      ? useAppStore.getState().threads.find((row) => row.id === ownedThreadId.current)
      : undefined;
    const thread =
      existing ??
      useAppStore.getState().createThread({
        ...(owner
          ? {
              threadId: remoteThreadId(owner.desktopId, hostThreadId),
              remoteServerId: owner.desktopId,
              remoteId: hostThreadId,
            }
          : ownedThreadId.current
            ? { threadId: ownedThreadId.current }
            : {}),
        projectId: project.id,
        agentKind: entry.source.agentKind,
        ...(entry.source.agentInstanceId ? { agentInstanceId: entry.source.agentInstanceId } : {}),
        ...(entry.source.workspaceId ? { workspaceId: entry.source.workspaceId } : {}),
        config: entry.source.config,
        prompt: question,
        title: entry.title,
        presentationMode: "gui",
        focus: false,
        parentThreadId: entry.source.id,
        ...(entry.source.worktreePath ? { worktreePath: entry.source.worktreePath } : {}),
        ...(entry.source.worktreeBranch ? { worktreeBranch: entry.source.worktreeBranch } : {}),
      });
    ownedThreadId.current = thread.id;
    setObservedThreadId(thread.id);
    const releaseLaunch = claimSideChatLaunch(thread.id);
    releaseWindow.current?.();
    const release = retainAuxiliaryThreadId(thread.id);
    releaseWindow.current = release;
    try {
      const questionSegments = segments ?? [
        ...(entry.segments ?? []).filter((segment) => segment.kind !== "text"),
        { kind: "text" as const, content: question },
      ];
      await readBridge().bindSideChatThread?.({
        ...(entry.id ? { id: entry.id } : {}),
        threadId: thread.id,
        prompt: question,
        segments: questionSegments,
      });
      const launch = sideChatLaunchInput(question, questionSegments, entry.context?.summary);
      const stillOwned = async () => {
        try {
          return (await readBridge().getSideChatThreadIds?.())?.includes(thread.id) !== false;
        } catch {
          return true;
        }
      };
      if (closed.current && !(await stillOwned())) {
        useAppStore.getState().deleteThread(thread.id);
        return;
      }
      if (owner) {
        const projectOwner = remoteOwner(project);
        if (!projectOwner || projectOwner.desktopId !== owner.desktopId)
          throw new Error(t`Remote project not found.`);
        await useRemoteServersStore.getState().launchRemoteThread(
          {
            desktopId: owner.desktopId,
            threadId: remoteOwner(thread)?.remoteId ?? hostThreadId,
            projectId: projectOwner.remoteId,
            agentKind: thread.agentKind,
            ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
            config: thread.config,
            prompt: launch.prompt,
            ...(launch.clientContext ? { clientContext: launch.clientContext } : {}),
            ...(launch.segments ? { segments: launch.segments } : {}),
            presentationMode: "gui",
            title: thread.title,
            ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
            ...(thread.worktreeBranch ? { worktreeBranch: thread.worktreeBranch } : {}),
          },
          {
            focus: false,
            isPendingLaunchOwned: () => !closed.current || auxiliaryThreadIds().has(thread.id),
          },
        );
      } else {
        await performInitialThreadLaunch({
          thread,
          projectLocation: resolveProjectLocation(project.location, thread.worktreePath),
          prompt: launch.prompt,
          ...(launch.clientContext ? { clientContext: launch.clientContext } : {}),
          ...(launch.segments ? { segments: launch.segments } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
        });
      }
      if (closed.current) {
        if (!(await stillOwned())) await unloadStoredThread(thread.id);
      } else {
        if (surface === "window") useAppStore.getState().openThread(thread.id);
        setThreadId(thread.id);
      }
    } catch (error) {
      if (!isRemoteCommandOutcomeUncertainError(error)) markThreadLaunchFailed(thread.id, error);
      setLaunchError(friendlyError(error));
      setUncertain(isRemoteCommandOutcomeUncertainError(error));
    } finally {
      // Retain a live window's session until the popup itself closes.
      if (closed.current) release();
      releaseLaunch();
      inFlight.current = false;
      setStarting(false);
    }
  }

  const didAutoStart = useRef(false);
  useEffect(() => {
    const initial = openingRequest.current;
    if (
      !project ||
      initial.autoStart === false ||
      initial.existingThreadId ||
      !initial.prompt.trim() ||
      didAutoStart.current
    )
      return;
    didAutoStart.current = true;
    void start(initial.prompt, initial.segments);
  });

  return {
    prompt,
    setPrompt,
    threadId,
    busy,
    launchError,
    uncertain,
    hasProject: project !== undefined,
    start,
  };
}
