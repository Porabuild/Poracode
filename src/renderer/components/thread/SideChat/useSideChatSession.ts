import { isClientDraftAsset } from "@/renderer/state/composerDrafts/clientDraftDatabase";
import {
  materializeDraftSegments,
  settleClientSubmission,
} from "@/renderer/actions/clientDraftSubmission";
import { appendOptimisticInitialUserMessage } from "@/renderer/actions/optimisticThreadInput";
import { captureSideChatTurnContext } from "./sideChatTurnContext";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_TERMINAL_SIZE, type PromptSegment } from "@/shared/contracts";
import { resolveProjectLocation } from "@/shared/worktree";
import { fileNameFromPath, hasSendablePromptContent, isImagePath } from "@/shared/promptContent";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";
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
import { retainAuxiliaryThreadId } from "@/renderer/state/auxiliaryThreadWindows";
import { updateSideChatPanelDraft } from "./sideChatPanelStore";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import {
  claimSideChatLaunch,
  isSideChatLaunching,
  useSideChatLaunchState,
} from "./sideChatLaunchState";
import { readBridge } from "@/renderer/bridge";
import type { SideChatBootstrap, SideChatSelection } from "@/shared/ipc/sideChat";
import { entityHost } from "@/renderer/state/entityHost";
import type { DraftContent } from "@/renderer/state/slices/types";
import { useProject, useThread } from "@/renderer/state/useThread";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";

function isSelectionSegment(
  segment: PromptSegment | NonNullable<SideChatBootstrap["segments"]>[number],
): segment is Extract<PromptSegment, { kind: "text" }> & { selection: true } {
  return segment.kind === "text" && "selection" in segment && segment.selection === true;
}

export function sideChatDraftFromBootstrap(
  entry: Pick<SideChatBootstrap, "prompt" | "segments">,
): DraftContent {
  const rawSegments: PromptSegment[] = entry.segments ?? [];
  const attachments = rawSegments.flatMap((segment, index) =>
    segment.kind === "attachment"
      ? [
          {
            id: `side-att-${index}`,
            path: segment.path,
            name: fileNameFromPath(segment.path),
            isImage: isImagePath(segment.path),
            ...(segment.mimeType ? { mimeType: segment.mimeType } : {}),
          },
        ]
      : [],
  );
  const inline = rawSegments.filter((segment) => segment.kind !== "attachment");
  if (inline.length === 0) {
    return {
      segments: entry.prompt ? [{ kind: "text", content: entry.prompt }] : [],
      attachments,
    };
  }
  if (inline.every(isSelectionSegment)) {
    const joinedSelections = inline.map((segment) => segment.content).join("\n\n");
    const spaced = inline.flatMap((segment, index) =>
      index > 0 ? [{ kind: "text" as const, content: "\n\n" }, segment] : [segment],
    );
    if (!entry.prompt || entry.prompt === joinedSelections) {
      return { segments: spaced, attachments };
    }
    const trailing = entry.prompt.startsWith(`${joinedSelections}\n\n`)
      ? entry.prompt.slice(joinedSelections.length + 2)
      : entry.prompt;
    return {
      segments: [...spaced, { kind: "text", content: `\n\n${trailing}` }],
      attachments,
    };
  }
  return { segments: inline, attachments };
}

export function sideChatBootstrapFromDraft(content: DraftContent): {
  prompt: string;
  segments: PromptSegment[];
} {
  const attachmentSegments: PromptSegment[] = content.attachments.map((attachment) => ({
    kind: "attachment",
    path: attachment.path,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
  }));
  const selections = content.segments.filter(isSelectionSegment);
  // Check whether inline segments are solely leading selection chips (+ "\n\n" spacers)
  // optionally followed by one plain-text trailing segment. In that common shape,
  // `prompt` holds `selection1\n\n...\n\ntext` and `segments` holds only the
  // selection/attachment items, matching the v1 side-chat ownership bootstrap format.
  let sawPlainText = false;
  let isLeadingSelectionsPlusTrailingText = selections.length > 0;
  const trailingParts: string[] = [];
  for (const segment of content.segments) {
    if (segment.kind !== "text") {
      isLeadingSelectionsPlusTrailingText = false;
      break;
    }
    if (isSelectionSegment(segment)) {
      if (sawPlainText) {
        isLeadingSelectionsPlusTrailingText = false;
        break;
      }
      continue;
    }
    if (segment.content.trim().length === 0 && !sawPlainText) {
      continue;
    }
    sawPlainText = true;
    trailingParts.push(segment.content);
  }
  if (isLeadingSelectionsPlusTrailingText) {
    const trailing = trailingParts
      .join("")
      .replace(/^\s*\n\n/, "")
      .replace(/^\s+/, "");
    const prompt = [...selections.map((segment) => segment.content), trailing]
      .filter(Boolean)
      .join("\n\n");
    return {
      prompt,
      segments: [...attachmentSegments, ...selections],
    };
  }
  return {
    prompt: flattenSegments(content.segments),
    segments: [...attachmentSegments, ...content.segments],
  };
}

function promptWithoutSelections(content: DraftContent): string {
  const nonSelections = content.segments.filter((segment) => !isSelectionSegment(segment));
  return flattenSegments(nonSelections).replace(/^\n\n/, "");
}

function compatibilityDraftSegments(content: DraftContent): PromptSegment[] {
  const attachmentSegments: PromptSegment[] = content.attachments.map((attachment) => ({
    kind: "attachment",
    path: attachment.path,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
  }));
  const selections = content.segments.filter(isSelectionSegment);
  const structured = content.segments.filter((segment) => segment.kind !== "text");
  return [...attachmentSegments, ...selections, ...structured];
}

export function useSideChatSession(entry: SideChatBootstrap, surface: "panel" | "window") {
  // Submission belongs to the opening request, never to subsequently typed drafts.
  const openingRequest = useRef(entry);
  const [draftContent, setDraftContentState] = useState<DraftContent>(() =>
    sideChatDraftFromBootstrap(entry),
  );
  const latestDraft = useRef(draftContent);
  const draftEditorMountedRef = useRef(false);
  const [selection, setSelectionState] = useState<SideChatSelection>(
    entry.selection ?? {
      agentKind: entry.source.agentKind,
      ...(entry.source.agentInstanceId ? { agentInstanceId: entry.source.agentInstanceId } : {}),
      config:
        entry.source.config.mode === "plan"
          ? { ...entry.source.config, mode: "agent" }
          : entry.source.config,
    },
  );
  const latestSelection = useRef(selection);

  function syncPanelDraft(nextDraft: DraftContent, nextSelection: SideChatSelection) {
    if (surface !== "panel") return;
    const serialized = sideChatBootstrapFromDraft(nextDraft);
    updateSideChatPanelDraft(entry.id, serialized.prompt, nextSelection, serialized.segments);
  }

  function setDraftContent(next: DraftContent) {
    latestDraft.current = next;
    setDraftContentState(next);
    syncPanelDraft(next, latestSelection.current);
  }

  function setSelection(value: SideChatSelection) {
    latestSelection.current = value;
    setSelectionState(value);
    syncPanelDraft(latestDraft.current, value);
  }

  function setPrompt(value: string) {
    const selections = latestDraft.current.segments.filter(isSelectionSegment);
    const spaced = selections.flatMap((segment, index) =>
      index > 0 ? [{ kind: "text" as const, content: "\n\n" }, segment] : [segment],
    );
    const segments: PromptSegment[] = [
      ...spaced,
      ...(value
        ? [{ kind: "text" as const, content: `${selections.length > 0 ? "\n\n" : ""}${value}` }]
        : []),
    ];
    setDraftContent({ segments, attachments: latestDraft.current.attachments });
  }

  function setDraftSegments(value: PromptSegment[]) {
    const text = promptWithoutSelections(latestDraft.current);
    setDraftContent(
      sideChatDraftFromBootstrap({
        prompt: [
          ...value.flatMap((segment) => (isSelectionSegment(segment) ? [segment.content] : [])),
          text,
        ]
          .filter(Boolean)
          .join("\n\n"),
        segments: value,
      }),
    );
  }

  const composerId = `side-chat:${entry.id}`;
  const pendingInputs = useComposerInputInbox((state) => state.itemsByComposer[composerId]);
  const adoptExternalDraft = useEffectEvent(() => {
    if (draftEditorMountedRef.current) return;
    const additions = useComposerInputInbox.getState().drain(composerId).flat();
    if (additions.length === 0) return;
    const currentText = promptWithoutSelections(latestDraft.current);
    const existingSelections = latestDraft.current.segments.filter(isSelectionSegment);
    const newSelections = additions.filter(isSelectionSegment);
    const newText = additions.flatMap((segment) =>
      segment.kind === "text" && !isSelectionSegment(segment) ? [segment.content] : [],
    );
    const allSelections = [...existingSelections, ...newSelections];
    const combinedText = [currentText, ...newText].filter(Boolean).join("\n\n");
    const spaced = allSelections.flatMap((segment, index) =>
      index > 0 ? [{ kind: "text" as const, content: "\n\n" }, segment] : [segment],
    );
    setDraftContent({
      segments: [
        ...spaced,
        ...(combinedText
          ? [
              {
                kind: "text" as const,
                content: `${allSelections.length > 0 ? "\n\n" : ""}${combinedText}`,
              },
            ]
          : []),
      ],
      attachments: latestDraft.current.attachments,
    });
  });
  useEffect(() => {
    if (pendingInputs) adoptExternalDraft();
  }, [pendingInputs]);

  const [threadId, setThreadId] = useState<string | undefined>(entry.existingThreadId);
  const ownedThreadId = useRef(entry.existingThreadId);
  const [observedThreadId, setObservedThreadId] = useState(entry.existingThreadId);
  const project = useProject(entry.source.projectId);
  const restoredThread = useThread(observedThreadId);
  const restoredOnce = useRef(false);
  const releaseWindow = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (
      !restoredThread ||
      (!entry.existingThreadId && !restoredThread.sessionRef) ||
      restoredOnce.current
    )
      return;
    restoredOnce.current = true;
    setThreadId(restoredThread.id);
    releaseWindow.current?.();
    releaseWindow.current = retainAuxiliaryThreadId(restoredThread.id);
    if (surface === "window") void openThread(restoredThread.id, { focusComposer: true });
    else {
      void hydrateThreadRuntimeItems(restoredThread.id);
      reopenStoredThread(restoredThread.id);
    }
  }, [restoredThread, surface, entry.existingThreadId]);
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
        const serialized = sideChatBootstrapFromDraft(latestDraft.current);
        void readBridge()
          .bindSideChatThread?.({
            ...(entry.id ? { id: entry.id } : {}),
            prompt: serialized.prompt,
            segments: serialized.segments,
            selection: latestSelection.current,
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

  async function start(
    question: string,
    segments?: PromptSegment[],
    launchSelection: SideChatSelection = latestSelection.current,
  ) {
    if (
      (entry.existingThreadId !== undefined && threadId !== undefined) ||
      inFlight.current ||
      isSideChatLaunching(ownedThreadId.current) ||
      closed.current ||
      !hasSendablePromptContent(question, segments)
    )
      return;
    if (!project) {
      await settleClientSubmission(entry.id, "failed").catch(() => undefined);
      return;
    }
    inFlight.current = true;
    setStarting(true);

    // The side chat lives on its source thread's host, whichever host that is.
    const sourceHost = entityHost(entry.source);
    const hostThreadId =
      (ownedThreadId.current && sourceHost?.hostThreadId(ownedThreadId.current)) ||
      ownedThreadId.current ||
      crypto.randomUUID();
    const identity = sourceHost?.projectThreadRow(hostThreadId) ?? { threadId: hostThreadId };
    const store = useAppStore.getState();
    const existing = ownedThreadId.current
      ? store.threads.find((row) => row.id === ownedThreadId.current)
      : undefined;
    // Reserve ownership before publishing the row, so sidebar subscribers never see it.
    const newThreadId = identity.threadId;
    releaseWindow.current?.();
    releaseWindow.current = retainAuxiliaryThreadId(newThreadId);
    const questionSegments = segments ?? [
      ...(entry.segments ?? []).filter((segment) => segment.kind !== "text"),
      { kind: "text" as const, content: question },
    ];
    const thread =
      existing ??
      store.createThread({
        ...identity,
        projectId: project.id,
        agentKind: launchSelection.agentKind,
        ...(launchSelection.agentInstanceId
          ? { agentInstanceId: launchSelection.agentInstanceId }
          : {}),
        ...(entry.source.workspaceId ? { workspaceId: entry.source.workspaceId } : {}),
        config: launchSelection.config,
        prompt: question,
        title: entry.title,
        presentationMode: "gui",
        focus: false,
        parentThreadId: entry.source.id,
        ...(entry.source.worktreePath ? { worktreePath: entry.source.worktreePath } : {}),
        ...(entry.source.worktreeBranch ? { worktreeBranch: entry.source.worktreeBranch } : {}),
      });
    ownedThreadId.current = thread.id;
    restoredOnce.current = true;
    setObservedThreadId(thread.id);
    const releaseLaunch = claimSideChatLaunch(thread.id);
    releaseWindow.current?.();
    const release = retainAuxiliaryThreadId(thread.id);
    releaseWindow.current = release;

    // Optimistically paint the initial user message and switch immediately to
    // SideChatThreadView (ThreadPane), matching Main Chat's launchDraftThread.
    const existingItems = store.runtimeItemsByIdByThread?.[thread.id];
    const userMessageItemId = existing
      ? Object.values(existingItems ?? {}).find((item) => item.type === "user_message")?.id
      : appendOptimisticInitialUserMessage(thread, question, questionSegments);
    if (userMessageItemId) {
      store.updateThreadRuntime?.(thread.id, {
        status: "working",
        attention: "working",
        canResumeWithConfig: false,
      });
    }
    if (surface === "panel") {
      updateSideChatPanelDraft(entry.id, question, launchSelection, questionSegments, thread.id);
    }
    if (surface === "window") store.openThread(thread.id);
    setThreadId(thread.id);

    const stillOwned = async () => {
      try {
        return (await readBridge().getSideChatThreadIds?.())?.includes(thread.id) !== false;
      } catch {
        return true;
      }
    };

    try {
      const bindPromise = Promise.resolve(
        readBridge().bindSideChatThread?.({
          ...(entry.id ? { id: entry.id } : {}),
          threadId: thread.id,
          thread,
          prompt: question,
          selection: launchSelection,
          segments: questionSegments,
        }),
      );
      const contextPromise = captureSideChatTurnContext(entry.source);
      // Prevent unhandled rejection if one leg rejects while awaiting the other.
      void bindPromise.catch(() => undefined);
      void contextPromise.catch(() => undefined);
      const [, clientContext] = await Promise.all([bindPromise, contextPromise]);
      if (closed.current && !(await stillOwned())) {
        useAppStore.getState().deleteThread(thread.id);
        await settleClientSubmission(entry.id, "failed");
        return;
      }
      const wireSegments = questionSegments.some(
        (segment) =>
          (segment.kind === "attachment" && isClientDraftAsset(segment.path)) ||
          segment.kind === "thread",
      )
        ? await materializeDraftSegments(thread, questionSegments, sourceHost?.hostId ?? thread.id)
        : questionSegments;
      const launch = {
        ...sideChatLaunchInput(question, wireSegments),
        ...(clientContext ? { clientContext } : {}),
      };
      await performInitialThreadLaunch({
        thread,
        projectLocation: resolveProjectLocation(project.location, thread.worktreePath),
        prompt: launch.prompt,
        ...(launch.clientContext ? { clientContext: launch.clientContext } : {}),
        ...(launch.segments ? { segments: launch.segments } : {}),
        ...(userMessageItemId ? { userMessageItemId } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
      });
      await settleClientSubmission(entry.id, "accepted");
      if (closed.current && !(await stillOwned())) {
        await unloadStoredThread(thread.id);
      }
    } catch (error) {
      if (closed.current && !(await stillOwned())) {
        useAppStore.getState().deleteThread(thread.id);
        await settleClientSubmission(entry.id, "failed").catch(() => undefined);
        return;
      }
      const outcomeUncertain = isRemoteCommandOutcomeUncertainError(error);
      await settleClientSubmission(entry.id, outcomeUncertain ? "uncertain" : "failed").catch(
        () => undefined,
      );
      if (!outcomeUncertain) markThreadLaunchFailed(thread.id, error);
    } finally {
      // Retain a live window's session until the popup itself closes.
      if (closed.current) release();
      releaseLaunch();
      inFlight.current = false;
      setStarting(false);
    }
  }

  const didAutoStart = useRef(false);
  useLayoutEffect(() => {
    const initial = openingRequest.current;
    if (
      !project ||
      initial.autoStart === false ||
      initial.existingThreadId ||
      !hasSendablePromptContent(initial.prompt, initial.segments) ||
      didAutoStart.current
    )
      return;
    didAutoStart.current = true;
    void start(initial.prompt, initial.segments);
  });

  const prompt = promptWithoutSelections(draftContent);
  const draftSegments = compatibilityDraftSegments(draftContent);

  return {
    composerId,
    draftContent,
    setDraftContent,
    draftEditorMountedRef,
    prompt,
    setPrompt,
    draftSegments,
    setDraftSegments,
    selection,
    setSelection,
    project,
    threadId,
    busy,
    hasProject: project !== undefined,
    start,
  };
}
