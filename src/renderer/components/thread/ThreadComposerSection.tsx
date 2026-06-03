import { useEffect, useRef, useState, type RefObject } from "react";
import { Tooltip } from "@heroui/react";
import { ChevronDown, GitFork } from "lucide-react";
import type {
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { ProviderModelMenuProvider, BranchSelector, type BranchSelection } from "../common";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import {
  AttachmentBar,
  ComposerAddMenu,
  ImageLightbox,
  MentionInput,
  VoiceInputButton,
  useAttachments,
} from "../composer";
import type { MentionInputHandle } from "../composer";
import { flattenSegments } from "../composer/serializeMentions";
import { getTriggerWords } from "@/renderer/components/providers";
import { readBridge } from "@/renderer/bridge";
import { captureProductEvent, threadProductProperties } from "@/renderer/analytics/posthog";
import { useAppStore } from "@/renderer/state/appStore";
import { buildLcSelectorFence, useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThread } from "@/renderer/state/useThread";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import { ActiveSubAgentTile } from "./ChatPane/parts/items/ActiveSubAgentTile";
import { selectActiveSubAgentParentItemIds } from "./ChatPane/chatPaneSelectors";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import { ThreadContextDock } from "./ThreadContextDock";
import { ThreadContextIndicator } from "./ThreadContextIndicator";
import { ThreadErrorDock } from "./ThreadErrorDock";
import { ThreadGoalDock } from "./ThreadGoalDock";
import { ThreadPendingSteerStrip } from "./ThreadPendingSteerStrip";
import { ThreadRuntimeRequestPanel } from "./ThreadRuntimeRequestPanel";
import { getApprovalDenyOption } from "./ThreadRuntimeRequestPanel/helpers";
import { ThreadAuthRequiredDock } from "./ThreadAuthRequiredDock";
import { ThreadTodoDock } from "./ThreadTodoDock";
import { hasReportedContextUsage, resolveThreadContextUsageSummary } from "./threadContextUsage";
import { capabilitiesForPresentation, filterHiddenModels } from "./threadComposerOptions";
import {
  appendProviderComposerControls,
  buildModelPickerControls,
  patchConfigForModelChange,
} from "./buildModelPickerControls";
import {
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
} from "./threadSlashCommands";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";
import { isAuthErrorMessage, type ThreadErrorDockState } from "./threadErrorState";
import type { ThreadGoalDockState } from "./threadGoalState";
import type { ThreadTodoDockState } from "./threadTodoState";
import type { TerminalPaneHandle } from "./TerminalPane";

function normalizeCursorComposerConfig(
  agentKind: string,
  config: ThreadConfig,
  capabilities: AgentStatus["capabilities"],
): ThreadConfig {
  if (agentKind !== "cursor" || capabilities.models.some((model) => model.id === config.model)) {
    return config;
  }

  const parsed = parseCursorModelId(config.model);
  const baseModel = migrateCursorBaseId(parsed.baseId);
  if (!capabilities.models.some((model) => model.id === baseModel)) {
    const fallback = capabilities.models[0]?.id;
    return fallback
      ? {
          ...config,
          model: fallback,
          effort: undefined,
          contextSize: undefined,
          fast: false,
          thinking: false,
        }
      : config;
  }

  return {
    ...config,
    model: baseModel,
    ...(parsed.effort && !config.effort ? { effort: parsed.effort } : {}),
    fast: config.fast ?? parsed.fast,
    thinking: config.thinking ?? parsed.thinking,
  };
}

function buildControls(
  thread: Thread,
  agentStatus: AgentStatus | undefined,
  hiddenModelIds: readonly string[] | undefined,
  onConfigChange: (config: ThreadConfig) => void,
): ComposerControl[] {
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const isCliThread = presentationMode === "terminal";
  if (isCliThread) return [];
  if (!agentStatus) return [];

  const presentationCapabilities = capabilitiesForPresentation(
    agentStatus.capabilities,
    presentationMode,
  );
  const filteredCaps = filterHiddenModels(presentationCapabilities, hiddenModelIds);
  const effectiveConfig = normalizeCursorComposerConfig(
    thread.agentKind,
    thread.config,
    filteredCaps,
  );
  const isDisabled = !thread.canResumeWithConfig;
  const onPatch = (patch: Partial<ThreadConfig>) =>
    onConfigChange({ ...thread.config, ...effectiveConfig, ...patch });
  const provider: ProviderModelMenuProvider = {
    kind: thread.agentKind,
    label: agentStatus.label,
    ...(agentStatus.icon ? { icon: agentStatus.icon } : {}),
    capabilities: filteredCaps,
  };

  return appendProviderComposerControls(
    buildModelPickerControls({
      providers: [provider],
      selectedAgentKind: thread.agentKind,
      model: effectiveConfig.model,
      ...(effectiveConfig.effort ? { effort: effectiveConfig.effort } : {}),
      ...(effectiveConfig.contextSize ? { contextSize: effectiveConfig.contextSize } : {}),
      ...(effectiveConfig.fast ? { fast: effectiveConfig.fast } : {}),
      ...(effectiveConfig.thinking ? { thinking: effectiveConfig.thinking } : {}),
      capabilities: filteredCaps,
      lockedAgentKind: thread.agentKind,
      presentationMode,
      isDisabled,
      onProviderModelChange: ({ model }) => {
        onPatch(
          patchConfigForModelChange(filteredCaps, model, {
            ...(effectiveConfig.effort ? { effort: effectiveConfig.effort } : {}),
            ...(effectiveConfig.contextSize ? { contextSize: effectiveConfig.contextSize } : {}),
            ...(effectiveConfig.fast ? { fast: effectiveConfig.fast } : {}),
            ...(effectiveConfig.thinking ? { thinking: effectiveConfig.thinking } : {}),
          }),
        );
      },
      onConfigPatch: onPatch,
    }),
    {
      agentKind: thread.agentKind,
      capabilities: filteredCaps,
      config: thread.config,
      presentationMode,
      isDisabled,
      onConfigChange: onPatch,
    },
  );
}

type ThreadComposerSectionProps = {
  threadId: string;
  fallbackThread: Thread;
  agentStatus: AgentStatus | undefined;
  projectLocation: ProjectLocation;
  paneCount: number;
  terminalPaneRef: RefObject<TerminalPaneHandle | null>;
  todoDockCollapsed: boolean;
  todoDockPlacement: "composer" | "right";
  todoDockState: ThreadTodoDockState | null;
  goalDockState: ThreadGoalDockState | null;
  errorDockStates: ThreadErrorDockState[];
  onGoalDockDismiss: () => void;
  onDismissError: (sourceItemId: string) => void;
  onConfigChange: (config: ThreadConfig) => void;
  onResolveServerRequest: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
  onSubmitInput: (prompt: string, segments?: PromptSegment[]) => Promise<void>;
  onTodoDockCollapsedChange: (collapsed: boolean) => void;
  onTodoDockPlacementChange: (placement: "composer" | "right") => void;
  onTodoDockRetire?: () => void;
};

export function ThreadComposerSection(props: ThreadComposerSectionProps) {
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  return <ThreadComposerSectionInner {...props} thread={thread} />;
}

function ThreadComposerSectionInner(props: ThreadComposerSectionProps & { thread: Thread }) {
  const {
    thread,
    agentStatus,
    projectLocation,
    paneCount,
    todoDockCollapsed,
    todoDockPlacement,
    todoDockState,
    goalDockState,
    errorDockStates,
  } = props;
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const showVoiceInputButton = useSharedSettings((s) => s.audio.showVoiceInputButton);
  const mentionRef = useRef<MentionInputHandle>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const attachments = useAttachments();
  const pendingPickedAttachments = useBrowserAttachInbox((s) => s.itemsByThread[thread.id]);
  const addPickedRef = useRef(attachments.addPicked);
  addPickedRef.current = attachments.addPicked;
  useEffect(() => {
    if (!pendingPickedAttachments || pendingPickedAttachments.length === 0) return;
    const drained = useBrowserAttachInbox.getState().drain(thread.id);
    for (const item of drained) {
      addPickedRef.current({
        path: item.attachmentPath,
        name: item.attachmentName,
        mimeType: item.mimeType,
        selector: item.selector,
        sourceUrl: item.sourceUrl,
      });
    }
  }, [pendingPickedAttachments, thread.id]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [controlOpenRequest, setControlOpenRequest] = useState<{
    target: "model" | "effort";
    nonce: number;
  } | null>(null);
  const [contextDockOpen, setContextDockOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const imageAttachments = attachments.attachments.filter((a) => a.isImage);
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const usesTerminalPresentation = presentationMode === "terminal";
  // Browser MCP is bound at session-create time for every provider, so a
  // mid-thread toggle would not actually attach (or detach) the MCP server in
  // the running agent process. The toggle is hidden in the active-thread
  // composer; users set it in the draft composer before launch.
  const browserMcpToggleableHere = false;
  const availableCommands = resolveAvailableSlashCommands(
    thread.slashCommands,
    agentStatus?.capabilities.slashCommands,
    {
      agentKind: thread.agentKind,
      presentationMode,
      hasEffort:
        ((
          agentStatus?.capabilities.modelEfforts?.[thread.config.model] ??
          agentStatus?.capabilities.efforts ??
          []
        ).length ?? 0) > 0,
      supportsFast: agentStatus
        ? supportsUsableFastMode(agentStatus.capabilities, thread.config.model)
        : false,
    },
  );
  const filteredCommands = filterSlashCommands(availableCommands, slashQuery);
  const showCommandPanel = filteredCommands.length > 0;
  // A stale runtime auth error (e.g. a 401 from before the user signed in)
  // must not keep the auth dock visible once detection confirms the agent is
  // authenticated again — otherwise the dock sticks until the user retries.
  const isAgentAuthenticated = agentStatus?.authState === "authenticated";
  const hasRuntimeAuthError =
    !isAgentAuthenticated && errorDockStates.some((state) => isAuthErrorMessage(state.message));
  const authRequired = agentStatus?.authState === "missing" || hasRuntimeAuthError;
  const isServerControlled =
    agentStatus?.capabilities.liveInputMode === "server" || !usesTerminalPresentation;
  const isTerminalInput = agentStatus?.capabilities.liveInputMode === "terminal";
  const needsFocusBeforeInput = agentStatus?.capabilities.requiresTerminalFocusBeforeInput === true;
  const canQueueServerInput =
    isServerControlled &&
    !usesTerminalPresentation &&
    thread.sessionRef !== undefined &&
    thread.status === "working";
  const canSubmitServerInput =
    isServerControlled &&
    thread.sessionRef !== undefined &&
    (thread.status === "idle" ||
      thread.status === "needs_reply" ||
      thread.status === "error" ||
      canQueueServerInput);
  const canSubmitTerminalInput =
    usesTerminalPresentation &&
    isTerminalInput &&
    thread.status !== "inactive" &&
    thread.status !== "launching";
  const showServerComposer = isServerControlled && thread.status !== "inactive";
  const showTerminalComposer =
    usesTerminalPresentation &&
    isTerminalInput &&
    thread.status !== "inactive" &&
    thread.status !== "launching";
  const showTodoInComposer =
    !usesTerminalPresentation && todoDockState !== null && todoDockPlacement === "composer";
  const showGoalInComposer = !usesTerminalPresentation && goalDockState !== null;
  const showErrorInComposer =
    !usesTerminalPresentation && errorDockStates.length > 0 && !hasRuntimeAuthError;
  const hasActiveSubAgent = useAppStore(
    (s) => !usesTerminalPresentation && selectActiveSubAgentParentItemIds(s, thread.id).length > 0,
  );
  const collapseTerminalComposerSetting = useSharedSettings((s) => s.collapseTerminalComposer);
  const [composerCollapsed, setComposerCollapsed] = useState(collapseTerminalComposerSetting);
  const canCollapseComposer = showTerminalComposer;
  const isComposerCollapsed = canCollapseComposer && composerCollapsed;
  const branchName = useGitStore(
    (s) =>
      thread.worktreeBranch ??
      (thread.worktreePath
        ? s.worktreeStatuses[thread.worktreePath]?.branch
        : s.statuses[thread.projectId]?.branch),
  );
  const hiddenModelIds = useSharedSettings((s) => s.hiddenModels[thread.agentKind]);
  const controls = buildControls(thread, agentStatus, hiddenModelIds, props.onConfigChange);
  const controlsWithOpenSignal = controls.map((control): ComposerControl => {
    if (controlOpenRequest?.target === "model" && control.kind === "provider-model") {
      return { ...control, openSignal: controlOpenRequest.nonce };
    }
    if (controlOpenRequest?.target === "effort" && control.kind === "effort-context") {
      return { ...control, openSignal: controlOpenRequest.nonce };
    }
    return control;
  });
  const isCliThread = usesTerminalPresentation;
  const canSubmit =
    (canSubmitServerInput || canSubmitTerminalInput) && !isSubmitting && !authRequired;
  const canInterruptStructuredTurn = !usesTerminalPresentation && thread.status === "working";
  const isStructuredLaunching = !usesTerminalPresentation && thread.status === "launching";
  const pendingSteer = useAppStore((s) => s.pendingSteerByThreadId[thread.id]);
  const usesPendingSteerPath = !usesTerminalPresentation && thread.status === "working";
  const runtimeRequests = useAppStore((s) => s.runtimeRequestsByThread[thread.id]);
  const activeRuntimeRequest = !usesTerminalPresentation ? runtimeRequests?.[0] : undefined;
  const approvalDenyOption = activeRuntimeRequest
    ? getApprovalDenyOption(activeRuntimeRequest)
    : undefined;
  const reportedContextUsage = useAppStore((s) =>
    !usesTerminalPresentation ? s.runtimeContextByThread[thread.id] : undefined,
  );
  const contextSummary = resolveThreadContextUsageSummary({
    thread,
    agentStatus,
    reportedUsage: reportedContextUsage,
  });
  const showContextIndicator =
    !usesTerminalPresentation &&
    hasReportedContextUsage(reportedContextUsage) &&
    contextSummary.maxTokens !== undefined;
  const showContextInComposer = showContextIndicator && contextDockOpen;
  const project = useAppStore((s) =>
    s.projects.find((candidate) => candidate.id === thread.projectId),
  );

  useEffect(() => {
    if (!showContextIndicator && contextDockOpen) {
      setContextDockOpen(false);
    }
  }, [contextDockOpen, showContextIndicator]);

  function handleInterrupt() {
    if (isInterrupting) return;
    setIsInterrupting(true);
    captureProductEvent("thread.interrupted", threadProductProperties(thread));
    void readBridge()
      .interruptThread({ threadId: thread.id })
      .catch((error: unknown) => {
        setIsInterrupting(false);
        console.error("[thread] failed to interrupt turn", error);
      });
  }

  function handleSwitchBranch(branch: string, createNew: boolean) {
    readBridge()
      .gitSwitchBranch({
        projectLocation,
        branch,
        createNew,
      })
      .then((result) => {
        const store = useGitStore.getState();
        const status = store.statuses[thread.projectId];
        if (status) {
          store.setStatus(thread.projectId, {
            ...status,
            branch: result.branch,
            tracking: result.tracking,
            ahead: result.ahead,
            behind: result.behind,
          });
        }
      })
      .catch((err: unknown) => {
        console.error("[git] switch branch failed", err);
      });
  }

  function handleBranchSelect(selection: BranchSelection) {
    if (!selection.isWorktree && selection.branch !== branchName) {
      handleSwitchBranch(selection.branch, false);
    }
  }

  function submitPrompt(segments: PromptSegment[]) {
    const attachmentSegments = attachments.toSegments();
    const selectorFences = attachments.attachments
      .filter((a) => a.selector && a.sourceUrl)
      .map((a) =>
        buildLcSelectorFence({
          selector: a.selector ?? "",
          sourceUrl: a.sourceUrl ?? "",
          attachmentName: a.name,
        }),
      );
    const selectorSegments: PromptSegment[] = selectorFences.map((text) => ({
      kind: "text" as const,
      content: text,
    }));
    const allSegments = [...attachmentSegments, ...selectorSegments, ...segments];
    const flat = flattenSegments(allSegments);
    if (flat.length === 0 || !canSubmit) return;
    const localAction = resolveLocalSlashCommandAction(flat, {
      agentKind: thread.agentKind,
      presentationMode,
    });
    if (localAction?.kind === "set-mode") {
      props.onConfigChange({ ...thread.config, mode: localAction.mode });
      mentionRef.current?.clear();
      mentionRef.current?.focus();
      setPrompt("");
      setHasContent(false);
      return;
    }
    if (localAction?.kind === "open-control") {
      setControlOpenRequest((prev) => ({
        target: localAction.target,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      mentionRef.current?.clear();
      setPrompt("");
      setHasContent(false);
      return;
    }
    if (localAction?.kind === "toggle-fast") {
      if (agentStatus && supportsUsableFastMode(agentStatus.capabilities, thread.config.model)) {
        props.onConfigChange({ ...thread.config, fast: thread.config.fast !== true });
      }
      mentionRef.current?.clear();
      mentionRef.current?.focus();
      setPrompt("");
      setHasContent(false);
      return;
    }
    const submittedInputSegments = segments;
    const submittedAttachments = attachments.attachments;
    const clearSubmittedComposer = () => {
      mentionRef.current?.clear();
      mentionRef.current?.focus();
      setPrompt("");
      setHasContent(false);
      attachments.clearAll();
    };
    const restoreSubmittedComposer = () => {
      mentionRef.current?.restoreFromSegments(submittedInputSegments);
      mentionRef.current?.focus();
      setPrompt(flat);
      setHasContent(flat.length > 0);
      if (submittedAttachments.length > 0) {
        attachments.restore(submittedAttachments);
      }
    };
    let clearedBeforeSendSettled = false;
    setIsSubmitting(true);
    if (!usesTerminalPresentation) {
      useAppStore.getState().requestChatScrollToBottom(thread.id);
    }

    const focusPromise = needsFocusBeforeInput
      ? (props.terminalPaneRef.current?.focus(), new Promise<void>((r) => setTimeout(r, 80)))
      : Promise.resolve();

    // If an approval is pending, send a decline before submitting the message.
    // The user's text becomes the next turn; the supervisor sees the denial
    // first, then the follow-up prompt explaining what to do differently.
    const denyPendingApproval = () => {
      if (!activeRuntimeRequest || !approvalDenyOption) return Promise.resolve();
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "request.resolved",
        threadId: thread.id,
        requestId: activeRuntimeRequest.requestId,
        outcome: "declined",
      });
      return props
        .onResolveServerRequest({
          requestId: activeRuntimeRequest.requestId,
          method: "requestPermission",
          response: { optionId: approvalDenyOption.optionId },
        })
        .catch((err) => {
          console.error("[chat] auto-deny on composer submit failed", err);
        });
    };

    // GUI threads + working status → stage as pending steer (replace-latest).
    // The supervisor fires the cancel and drains the slot when the in-flight
    // turn returns with `cancelled` stopReason. No optimistic chat paint —
    // the strip above the composer is the visual confirmation; the real
    // user_message item lands when the turn drains and starts.
    const runSubmission = () =>
      usesPendingSteerPath
        ? readBridge().setPendingSteer({
            threadId: thread.id,
            prompt: flat,
            ...(allSegments.length > 0 ? { segments: allSegments } : {}),
            config: thread.config,
          })
        : props.onSubmitInput(flat, allSegments.length > 0 ? allSegments : undefined);

    if (!usesTerminalPresentation) {
      clearSubmittedComposer();
      clearedBeforeSendSettled = true;
    }

    void focusPromise
      .then(denyPendingApproval)
      .then(runSubmission)
      .then(() => {
        if (!clearedBeforeSendSettled) {
          clearSubmittedComposer();
        }
      })
      .catch(() => {
        // Leave the prompt intact so the user can retry.
        if (clearedBeforeSendSettled) {
          restoreSubmittedComposer();
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  function handleCancelPendingSteer() {
    void readBridge()
      .clearPendingSteer({ threadId: thread.id })
      .catch((error: unknown) => {
        console.error("[thread] failed to clear pending steer", error);
      });
  }

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    if (filteredCommands.length === 0) {
      if (slashActiveIndex !== 0) {
        setSlashActiveIndex(0);
      }
      return;
    }
    if (slashActiveIndex >= filteredCommands.length) {
      setSlashActiveIndex(filteredCommands.length - 1);
    }
  }, [filteredCommands.length, slashActiveIndex]);

  useEffect(() => {
    setPrompt("");
    setIsInterrupting(false);
    setSlashQuery(null);
    setSlashActiveIndex(0);
    setContextDockOpen(false);
    setComposerCollapsed(collapseTerminalComposerSetting);
  }, [thread.id, collapseTerminalComposerSetting]);

  useEffect(() => {
    if (thread.status !== "working") setIsInterrupting(false);
  }, [thread.status]);

  useEffect(() => {
    if (isComposerCollapsed) {
      setSlashQuery(null);
    }
  }, [isComposerCollapsed]);

  useEffect(() => {
    function handlePasteToComposer(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (text) setPrompt((prev) => prev + text);
    }
    window.addEventListener("lightcode:paste-to-composer", handlePasteToComposer);
    return () => window.removeEventListener("lightcode:paste-to-composer", handlePasteToComposer);
  }, []);

  const pendingComposerFocusThreadId = useAppStore((s) => s.pendingComposerFocusThreadId);
  useEffect(() => {
    if (pendingComposerFocusThreadId !== thread.id) return;
    const raf = requestAnimationFrame(() => {
      mentionRef.current?.focus();
      useAppStore.getState().clearComposerFocusRequest(thread.id);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingComposerFocusThreadId, thread.id]);

  return (
    <>
      {thread.status !== "launching" || !usesTerminalPresentation ? (
        <div>
          <div
            className={`grid transition-[grid-template-rows] ease-[cubic-bezier(0.16,1,0.3,1)] ${isComposerCollapsed ? "duration-300" : "duration-200"}`}
            style={{ gridTemplateRows: isComposerCollapsed ? "0fr" : "1fr" }}
          >
            <div className="overflow-hidden">
              <div
                className={`relative ${isComposerCollapsed ? "pointer-events-none" : ""}`}
                style={{
                  opacity: isComposerCollapsed ? 0 : 1,
                  transition: isComposerCollapsed
                    ? "opacity 150ms ease 50ms"
                    : "opacity 200ms ease 100ms",
                }}
              >
                <ThreadComposer
                  autoFocus={paneCount === 1} // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                  compact
                  toolbarLayoutKey={[
                    isCliThread ? "cli" : "chat",
                    showContextIndicator ? "ctx" : "no-ctx",
                    branchName ?? "",
                    thread.worktreePath ? "wt" : "br",
                    thread.prNumber ? `pr=${thread.prNumber}` : "",
                    authRequired ? "auth-required" : "auth-ready",
                  ].join("|")}
                  fixedContent={
                    hasActiveSubAgent ||
                    showContextInComposer ||
                    showErrorInComposer ||
                    showGoalInComposer ||
                    showTodoInComposer ||
                    authRequired ||
                    pendingSteer ||
                    activeRuntimeRequest ||
                    showCommandPanel ? (
                      <>
                        {hasActiveSubAgent ? (
                          <ActiveSubAgentTile
                            threadId={thread.id}
                            projectLocation={projectLocation}
                          />
                        ) : null}
                        {showContextInComposer ? (
                          <ThreadContextDock
                            summary={contextSummary}
                            onClose={() => setContextDockOpen(false)}
                          />
                        ) : null}
                        {showErrorInComposer
                          ? errorDockStates.map((state) => (
                              <ThreadErrorDock
                                key={state.sourceItemId}
                                state={state}
                                onDismiss={() => props.onDismissError(state.sourceItemId)}
                              />
                            ))
                          : null}
                        {showGoalInComposer ? (
                          <ThreadGoalDock
                            state={goalDockState!}
                            onDismiss={props.onGoalDockDismiss}
                          />
                        ) : null}
                        {showTodoInComposer ? (
                          <ThreadTodoDock
                            collapsed={todoDockCollapsed}
                            placement={todoDockPlacement}
                            state={todoDockState!}
                            onCollapsedChange={props.onTodoDockCollapsedChange}
                            onPlacementChange={props.onTodoDockPlacementChange}
                            onRetire={() => props.onTodoDockRetire?.()}
                          />
                        ) : null}
                        {authRequired && agentStatus ? (
                          <ThreadAuthRequiredDock
                            agentStatus={agentStatus}
                            {...(project ? { project } : {})}
                          />
                        ) : null}
                        {pendingSteer ? (
                          <ThreadPendingSteerStrip
                            pending={pendingSteer}
                            onCancel={handleCancelPendingSteer}
                          />
                        ) : null}
                        {activeRuntimeRequest ? (
                          <ThreadRuntimeRequestPanel
                            key={activeRuntimeRequest.requestId}
                            threadId={thread.id}
                            agentLabel={agentStatus?.label}
                            request={activeRuntimeRequest}
                            onResolve={props.onResolveServerRequest}
                            onPlanApproved={(optionId) =>
                              props.onConfigChange({
                                ...thread.config,
                                mode: "agent",
                                ...(optionId === "default" || optionId === "auto"
                                  ? { approvalPolicy: optionId }
                                  : {}),
                              })
                            }
                            onOpenPlanFile={
                              project
                                ? (path) =>
                                    void openFileInEditor(
                                      project,
                                      thread.worktreePath,
                                      branchName,
                                      path,
                                      { markdownPreview: true },
                                    )
                                : undefined
                            }
                          />
                        ) : null}
                        {showCommandPanel ? (
                          <ThreadCommandPanel
                            commands={filteredCommands}
                            activeIndex={slashActiveIndex}
                            onActiveIndexChange={setSlashActiveIndex}
                            onSelect={(cmd) => {
                              mentionRef.current?.insertSlashCommand(cmd.id);
                              setSlashQuery(null);
                            }}
                          />
                        ) : null}
                      </>
                    ) : null
                  }
                  attachmentBar={
                    <AttachmentBar
                      attachments={attachments.attachments}
                      onRemove={attachments.removeAttachment}
                      onPreviewImage={(att) => {
                        const idx = imageAttachments.findIndex((a) => a.id === att.id);
                        if (idx >= 0) setLightboxIndex(idx);
                      }}
                    />
                  }
                  inputContent={
                    <MentionInput
                      ref={mentionRef}
                      autoFocus={paneCount === 1} // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                      compact
                      disabled={!(showServerComposer || showTerminalComposer)}
                      placeholder={
                        approvalDenyOption
                          ? "Deny and tell the agent what to do differently…"
                          : isServerControlled
                            ? `Ask ${agentStatus?.label ?? "the agent"} anything about this workspace`
                            : "Send a message..."
                      }
                      projectLocation={projectLocation}
                      projectId={thread.projectId}
                      triggerWords={getTriggerWords(thread.agentKind, thread.config.model)}
                      onTextChange={setHasContent}
                      onSubmit={submitPrompt}
                      onPasteImage={(file) => {
                        void attachments.addClipboardImage(file, thread.id);
                      }}
                      onInterceptKey={(e) => {
                        if (
                          !usesTerminalPresentation &&
                          handleComposerControlShortcut(e, {
                            controls: controlsWithOpenSignal,
                            onOpenModelPicker: () => {
                              setControlOpenRequest((prev) => ({
                                target: "model",
                                nonce: (prev?.nonce ?? 0) + 1,
                              }));
                            },
                          })
                        ) {
                          return true;
                        }

                        if (
                          showCommandPanel &&
                          handleSlashCommandPanelKeyDown(e, {
                            slashQuery,
                            filteredCommands,
                            slashActiveIndex,
                            setSlashActiveIndex,
                            setSlashQuery,
                            mentionRef,
                          })
                        ) {
                          return true;
                        }

                        if (showTerminalComposer) {
                          if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            void readBridge().writeTerminal({
                              threadId: thread.id,
                              data: "\x1b[Z",
                            });
                            return true;
                          }
                          if (
                            (e.ctrlKey || e.metaKey) &&
                            !e.shiftKey &&
                            !e.altKey &&
                            e.key.toLowerCase() === "t"
                          ) {
                            e.preventDefault();
                            void readBridge().writeTerminal({
                              threadId: thread.id,
                              data: "\x14",
                            });
                            return true;
                          }
                        }
                        return false;
                      }}
                      onSlashCommandChange={setSlashQuery}
                    />
                  }
                  controls={controlsWithOpenSignal}
                  placeholder="Send a message..."
                  prompt={prompt}
                  promptDisabled={!(showServerComposer || showTerminalComposer)}
                  preserveDisabledControlStyle={isStructuredLaunching}
                  stopPending={isInterrupting || isStructuredLaunching}
                  submitDisabled={!(hasContent || attachments.attachments.length > 0) || !canSubmit}
                  submitLabel="Send message"
                  onStop={
                    canInterruptStructuredTurn
                      ? handleInterrupt
                      : isStructuredLaunching
                        ? () => undefined
                        : undefined
                  }
                  {...(() => {
                    const renderExtras = (level: number) => (
                      <>
                        {showContextIndicator ? (
                          <ThreadContextIndicator
                            summary={contextSummary}
                            isOpen={contextDockOpen}
                            onToggle={() => setContextDockOpen((open) => !open)}
                          />
                        ) : null}
                        <ComposerAddMenu
                          browserMcpEnabled={thread.config.browserMcp === true}
                          showBrowserOption={browserMcpToggleableHere}
                          onPickFiles={() => {
                            void readBridge()
                              .pickFiles()
                              .then((paths) => {
                                if (paths) attachments.addFiles(paths);
                              });
                          }}
                          onToggleBrowserMcp={(next) =>
                            props.onConfigChange({ ...thread.config, browserMcp: next })
                          }
                        />
                        {branchName ? (
                          thread.worktreePath ? (
                            <Tooltip delay={0}>
                              <Tooltip.Trigger tabIndex={-1} role="none">
                                <div className="lightcode-composer-static lightcode-composer-worktree min-w-0 max-w-48 px-2.5">
                                  <GitFork className="size-3.5 text-muted" />
                                  {level < 3 && <span className="truncate">{branchName}</span>}
                                  {level < 3 && thread.prNumber ? (
                                    <span className="shrink-0 text-muted/60">
                                      PR #{thread.prNumber}
                                    </span>
                                  ) : null}
                                </div>
                              </Tooltip.Trigger>
                              <Tooltip.Content placement="top">{branchName}</Tooltip.Content>
                            </Tooltip>
                          ) : (
                            <BranchSelector
                              projectId={thread.projectId}
                              currentBranch={branchName}
                              value={branchName}
                              onSelect={handleBranchSelect}
                              onSwitchBranch={handleSwitchBranch}
                              hideWorktreeToggle
                              forceHideLabel={level >= 3}
                              iconOnly={level >= 3}
                            />
                          )
                        ) : null}
                      </>
                    );
                    const renderVoiceInput = () =>
                      showVoiceInputButton ? (
                        <VoiceInputButton
                          isDisabled={
                            authRequired ||
                            isSubmitting ||
                            !(showServerComposer || showTerminalComposer)
                          }
                          onTranscript={(text) => {
                            mentionRef.current?.commitVoiceTranscript(text);
                          }}
                          onTranscriptPreview={(text) => {
                            mentionRef.current?.previewVoiceTranscript(text);
                          }}
                          onTranscriptCancel={() => {
                            mentionRef.current?.clearVoiceTranscriptPreview();
                          }}
                        />
                      ) : null;
                    return isCliThread
                      ? { leadingControls: renderExtras, afterControls: renderVoiceInput }
                      : {
                          afterControls: (level: number) => (
                            <>
                              {renderExtras(level)}
                              {renderVoiceInput()}
                            </>
                          ),
                        };
                  })()}
                  onPromptChange={setPrompt}
                  onAttachFiles={attachments.addFiles}
                  onSubmit={() => {
                    const segments = mentionRef.current?.serializeSegments();
                    submitPrompt(
                      segments && segments.length > 0
                        ? segments
                        : [{ kind: "text", content: prompt.trim() }],
                    );
                  }}
                />
              </div>
            </div>
          </div>
          {canCollapseComposer ? (
            <div className="relative z-10 flex h-0 justify-center">
              <button
                type="button"
                aria-label={isComposerCollapsed ? "Show composer" : "Collapse composer"}
                className="absolute -top-[9px] flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-0 text-muted transition-colors hover:text-foreground"
                onClick={() => setComposerCollapsed(!composerCollapsed)}
              >
                <ChevronDown
                  className={`size-3.5 transition-transform duration-150 ${isComposerCollapsed ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {lightboxIndex !== null && imageAttachments.length > 0 ? (
        <ImageLightbox
          images={imageAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}
