import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Tooltip, toast } from "@heroui/react";
import { ChevronDown, GitFork } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { AgentStatus, ProjectLocation, PromptSegment, Thread } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { changeThreadConfig } from "@/renderer/actions/threadRuntimeActions";
import { BranchSelector, type BranchSelection } from "../common";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import {
  AttachmentBar,
  ComposerAddMenu,
  composerMcpServers,
  mcpTogglePatch,
  ComposerVoiceInput,
  MentionInput,
  openAttachmentLightbox,
  useAttachments,
} from "../composer";
import type { MentionInputHandle, VoiceInputHandle } from "../composer";
import { getTriggerWords } from "@/renderer/components/providers";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { captureProductEvent, threadProductProperties } from "@/renderer/analytics/posthog";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import { useComposerUiStore } from "@/renderer/state/composerUiStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThread } from "@/renderer/state/useThread";
import { selectActiveSubAgentParentItemIds } from "./ChatPane/chatPaneSelectors";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import { ThreadContextIndicator } from "./ThreadContextIndicator";
import { getApprovalDenyOption } from "./ThreadRuntimeRequestPanel/helpers";
import { hasReportedContextUsage, resolveThreadContextUsageSummary } from "./threadContextUsage";
import { buildControls } from "./buildModelPickerControls";
import { submitComposerPrompt } from "./threadComposerSubmit";
import {
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
} from "./threadSlashCommands";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";
import { isAuthErrorMessage, type ThreadErrorDockState } from "./threadErrorState";
import type { ThreadGoalDockState } from "./threadGoalState";
import type { ThreadTodoDockState } from "./threadTodoState";
import type { TerminalPaneHandle } from "./TerminalPane";
import { ThreadComposerDocks } from "./ThreadComposerDocks";

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
  /**
   * Optional override for the thread-input submit. Desktop omits this so the
   * composer calls `submitThreadInput` from the actions module directly. Mobile
   * injects its own wrapper so it can collapse the floating dock after the send
   * resolves and route through the mobile transport.
   */
  onSubmitInput?: ((prompt: string, segments?: PromptSegment[]) => Promise<void>) | undefined;
  onOpenProjectRelativePath?: ((path: string, lineNumber?: number) => void) | undefined;
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
  const { t } = useLingui();
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const isRemote = isRemoteSession();
  const showVoiceInputButton = useSharedSettings((s) => s.audio.showVoiceInputButton) && !isRemote;
  const mentionRef = useRef<MentionInputHandle>(null);
  const voiceInputRef = useRef<VoiceInputHandle>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const attachments = useAttachments();
  // Unsent composer content survives leaving this thread: switching panes
  // remounts this section (ThreadPane is keyed by threadId), so we save the
  // typed segments + attachments on unmount and restore them on the next mount.
  const saveThreadDraftContent = useAppStore((s) => s.saveThreadDraftContent);
  const clearThreadDraftContent = useAppStore((s) => s.clearThreadDraftContent);
  // The MentionInput owns the live editor DOM; mirror its latest serialized
  // segments here (updated on every text change) so the unmount cleanup can read
  // them without touching a possibly-detached editor ref. Attachments are synced
  // every render below.
  const latestSegmentsRef = useRef<PromptSegment[]>([]);
  const attachmentsRef = useRef(attachments.attachments);
  attachmentsRef.current = attachments.attachments;
  // True only while a real submit is in flight. Terminal/CLI threads clear the
  // composer *after* the send resolves (the synchronous pre-send clear below is
  // GUI-only), so without this guard, navigating away mid-send would unmount and
  // re-save the just-sent text as a stale draft. Reset every time (success or
  // failure) because this composer is reused for the next message.
  const submittedRef = useRef(false);
  // Captured once at mount; consumed (and cleared) by the restore effect below.
  const initialThreadDraftRef = useRef(useAppStore.getState().threadDraftContents[thread.id]);
  // Guards the restore effect so it runs exactly once — when the editor first
  // mounts — even though its dep (`editorMounted`) can flip after mount.
  const draftRestoredRef = useRef(false);
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
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const usesTerminalPresentation = presentationMode === "terminal";
  // Composer MCP servers are bound at session-create time for the active
  // thread. The toggles are hidden here; users set them in the draft composer
  // before launch.
  const mcpServers = composerMcpServers.map((descriptor) => ({
    descriptor,
    enabled: thread.config[descriptor.configKey] === true,
    visible: false,
    onToggle: (next: boolean) =>
      changeThreadConfig(thread.id, {
        ...thread.config,
        ...mcpTogglePatch(descriptor.configKey, next),
      }),
  }));
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
  const canShowRuntimeChrome = !usesTerminalPresentation || isRemote;
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
    canShowRuntimeChrome && todoDockState !== null && todoDockPlacement === "composer";
  const showGoalInComposer = canShowRuntimeChrome && goalDockState !== null;
  const showErrorInComposer =
    (!usesTerminalPresentation || isRemote) && errorDockStates.length > 0 && !hasRuntimeAuthError;
  const hasActiveSubAgent = useAppStore(
    (s) => canShowRuntimeChrome && selectActiveSubAgentParentItemIds(s, thread.id).length > 0,
  );
  const collapseTerminalComposerSetting = useSharedSettings((s) => s.collapseTerminalComposer);
  const [composerCollapsed, setComposerCollapsed] = useState(collapseTerminalComposerSetting);
  const canCollapseComposer = showTerminalComposer && !isRemote;
  const isComposerCollapsed = canCollapseComposer && composerCollapsed;
  const setComposerUi = useComposerUiStore((s) => s.setComposerUi);
  const branchName = useGitStore(
    (s) =>
      thread.worktreeBranch ??
      (thread.worktreePath
        ? s.worktreeStatuses[thread.worktreePath]?.branch
        : s.statuses[thread.projectId]?.branch),
  );
  const hiddenModelIds = useSharedSettings(
    (s) => s.hiddenModels[modelVisibilityKey(thread.agentKind, presentationMode)],
  );
  const controls = buildControls(thread, agentStatus, hiddenModelIds, (config) =>
    changeThreadConfig(thread.id, config),
  );
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
  const canInterruptStructuredTurn = canShowRuntimeChrome && thread.status === "working";
  const isStructuredLaunching = !usesTerminalPresentation && thread.status === "launching";
  const pendingSteer = useAppStore((s) => s.pendingSteerByThreadId[thread.id]);
  const usesPendingSteerPath = !usesTerminalPresentation && thread.status === "working";
  const runtimeRequests = useAppStore((s) => s.runtimeRequestsByThread[thread.id]);
  const activeRuntimeRequest = canShowRuntimeChrome ? runtimeRequests?.[0] : undefined;
  const approvalDenyOption = activeRuntimeRequest
    ? getApprovalDenyOption(activeRuntimeRequest)
    : undefined;
  const reportedContextUsage = useAppStore((s) =>
    canShowRuntimeChrome ? s.runtimeContextByThread[thread.id] : undefined,
  );
  const contextSummary = resolveThreadContextUsageSummary({
    thread,
    agentStatus,
    reportedUsage: reportedContextUsage,
  });
  const showContextIndicator =
    canShowRuntimeChrome &&
    hasReportedContextUsage(reportedContextUsage) &&
    contextSummary.maxTokens !== undefined;
  const showContextInComposer = showContextIndicator && contextDockOpen;
  const project = useAppStore((s) =>
    s.projects.find((candidate) => candidate.id === thread.projectId),
  );
  const agentFallbackLabel = t`the agent`;

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
        toast.danger(friendlyError(error));
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
        toast.danger(friendlyError(err));
      });
  }

  function handleBranchSelect(selection: BranchSelection) {
    if (!selection.isWorktree && selection.branch !== branchName) {
      handleSwitchBranch(selection.branch, false);
    }
  }

  function submitPrompt(segments: PromptSegment[]) {
    submitComposerPrompt(segments, {
      thread,
      agentStatus,
      presentationMode,
      usesTerminalPresentation,
      canSubmit,
      usesPendingSteerPath,
      needsFocusBeforeInput,
      activeRuntimeRequest,
      approvalDenyOption,
      attachments,
      mentionRef,
      terminalPaneRef: props.terminalPaneRef,
      latestSegmentsRef,
      submittedRef,
      setPrompt,
      setHasContent,
      setIsSubmitting,
      requestOpenControl: (target) =>
        setControlOpenRequest((prev) => ({ target, nonce: (prev?.nonce ?? 0) + 1 })),
      onSubmitInput: props.onSubmitInput,
    });
  }

  function handleCancelPendingSteer() {
    void readBridge()
      .clearPendingSteer({ threadId: thread.id })
      .catch((error: unknown) => {
        console.error("[thread] failed to clear pending steer", error);
        toast.danger(friendlyError(error));
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

  // Restore an unsent draft saved the last time this thread's composer was
  // mounted. useLayoutEffect (and reading the editor via the imperative handle)
  // runs before paint so the text never flashes empty. Consume the entry so a
  // later real send doesn't resurrect it.
  //
  // A terminal thread that is still `launching` hides the whole composer (so the
  // MentionInput — and `mentionRef` — does not exist yet). Restoring into a null
  // editor would silently drop the text while still consuming the stored draft,
  // so defer until the editor mounts; the effect re-runs when `editorMounted`
  // flips, at which point `mentionRef` is attached.
  const editorMounted = !usesTerminalPresentation || thread.status !== "launching";
  useLayoutEffect(() => {
    if (draftRestoredRef.current || !editorMounted) return;
    draftRestoredRef.current = true;
    const saved = initialThreadDraftRef.current;
    if (!saved) return;
    if (saved.segments.length > 0) {
      mentionRef.current?.restoreFromSegments(saved.segments);
      latestSegmentsRef.current = saved.segments;
    }
    if (saved.attachments.length > 0) {
      attachments.restore(saved.attachments);
    }
    clearThreadDraftContent(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore runs once, when the editor first mounts
  }, [editorMounted]);

  // Save whatever is left in the composer when this thread's section unmounts
  // (navigating to another thread/pane). A cleared composer leaves both refs
  // empty, so a just-sent message is not re-saved; an in-flight submit is
  // skipped via submittedRef because its text has already been handed off.
  useEffect(() => {
    const tid = thread.id;
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reading the latest refs at unmount is the point: they mirror the live composer state
      if (submittedRef.current) return;
      const segments = latestSegmentsRef.current;
      const atts = attachmentsRef.current;
      if (segments.length > 0 || atts.length > 0) {
        saveThreadDraftContent(tid, { segments, attachments: atts });
      } else {
        clearThreadDraftContent(tid);
      }
    };
  }, [thread.id, saveThreadDraftContent, clearThreadDraftContent]);

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

  // Publish the rendered presentation + collapsed state so the browser element
  // picker can decide whether a pick should go to the terminal or the composer.
  useEffect(() => {
    setComposerUi(thread.id, { presentation: presentationMode, collapsed: isComposerCollapsed });
  }, [thread.id, presentationMode, isComposerCollapsed, setComposerUi]);
  useEffect(() => {
    return () => useComposerUiStore.getState().clearComposerUi(thread.id);
  }, [thread.id]);

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
                  autoFocus={paneCount === 1 && !isRemote} // eslint-disable-line jsx-a11y/no-autofocus -- desktop only; mobile PWA skips it so opening a thread doesn't pop the keyboard
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
                      <ThreadComposerDocks
                        hasActiveSubAgent={hasActiveSubAgent}
                        showContextInComposer={showContextInComposer}
                        showErrorInComposer={showErrorInComposer}
                        showGoalInComposer={showGoalInComposer}
                        showTodoInComposer={showTodoInComposer}
                        authRequired={authRequired}
                        showCommandPanel={showCommandPanel}
                        threadId={thread.id}
                        projectLocation={projectLocation}
                        threadConfig={thread.config}
                        worktreePath={thread.worktreePath}
                        branchName={branchName}
                        agentStatus={agentStatus}
                        project={project}
                        contextSummary={contextSummary}
                        errorDockStates={errorDockStates}
                        goalDockState={goalDockState}
                        todoDockState={todoDockState}
                        todoDockCollapsed={todoDockCollapsed}
                        todoDockPlacement={todoDockPlacement}
                        pendingSteer={pendingSteer}
                        activeRuntimeRequest={activeRuntimeRequest}
                        filteredCommands={filteredCommands}
                        slashActiveIndex={slashActiveIndex}
                        onCloseContextDock={() => setContextDockOpen(false)}
                        onDismissError={props.onDismissError}
                        onGoalDockDismiss={props.onGoalDockDismiss}
                        onTodoDockCollapsedChange={props.onTodoDockCollapsedChange}
                        onTodoDockPlacementChange={props.onTodoDockPlacementChange}
                        {...(props.onTodoDockRetire
                          ? { onTodoDockRetire: props.onTodoDockRetire }
                          : {})}
                        onCancelPendingSteer={handleCancelPendingSteer}
                        {...(props.onOpenProjectRelativePath
                          ? { onOpenProjectRelativePath: props.onOpenProjectRelativePath }
                          : {})}
                        onSlashActiveIndexChange={setSlashActiveIndex}
                        onSelectCommand={(cmd) => {
                          mentionRef.current?.insertSlashCommand(cmd.id);
                          setSlashQuery(null);
                        }}
                      />
                    ) : null
                  }
                  attachmentBar={
                    <AttachmentBar
                      attachments={attachments.attachments}
                      onRemove={attachments.removeAttachment}
                      onPreviewImage={(att) => {
                        const imageAttachments = attachments.attachments.filter((a) => a.isImage);
                        const idx = imageAttachments.findIndex((a) => a.id === att.id);
                        if (idx >= 0) openAttachmentLightbox(imageAttachments, idx);
                      }}
                    />
                  }
                  inputContent={
                    <MentionInput
                      ref={mentionRef}
                      autoFocus={paneCount === 1 && !isRemote} // eslint-disable-line jsx-a11y/no-autofocus -- desktop only; mobile PWA skips it so opening a thread doesn't pop the keyboard
                      compact
                      disabled={!(showServerComposer || showTerminalComposer)}
                      placeholder={
                        approvalDenyOption
                          ? t`Deny and tell the agent what to do differently…`
                          : isServerControlled
                            ? t`Ask ${agentStatus?.label ?? agentFallbackLabel} anything about this workspace`
                            : t`Send a message...`
                      }
                      projectLocation={projectLocation}
                      projectId={thread.projectId}
                      triggerWords={getTriggerWords(thread.agentKind, thread.config.model)}
                      onTextChange={(hasText) => {
                        setHasContent(hasText);
                        latestSegmentsRef.current = mentionRef.current?.serializeSegments() ?? [];
                      }}
                      onSubmit={submitPrompt}
                      {...(!isRemote
                        ? {
                            onPasteImage: (file: File) => {
                              void attachments.addClipboardImage(file, thread.id);
                            },
                          }
                        : {})}
                      onInterceptKey={(e) => {
                        if (
                          !usesTerminalPresentation &&
                          handleComposerControlShortcut(e, {
                            controls: controlsWithOpenSignal,
                            keybindings: useKeybindingStore.getState().keybindings,
                            platform: readBridge().platform,
                            onOpenModelPicker: () => {
                              setControlOpenRequest((prev) => ({
                                target: "model",
                                nonce: (prev?.nonce ?? 0) + 1,
                              }));
                            },
                            onStartDictation: () => voiceInputRef.current?.toggle() ?? false,
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
                            void readBridge()
                              .writeTerminal({
                                threadId: thread.id,
                                data: "\x1b[Z",
                              })
                              .catch((error: unknown) => {
                                toast.danger(friendlyError(error));
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
                            void readBridge()
                              .writeTerminal({
                                threadId: thread.id,
                                data: "\x14",
                              })
                              .catch((error: unknown) => {
                                toast.danger(friendlyError(error));
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
                  placeholder={t`Send a message...`}
                  prompt={prompt}
                  promptDisabled={!(showServerComposer || showTerminalComposer)}
                  preserveDisabledControlStyle={isStructuredLaunching}
                  stopPending={isInterrupting || isStructuredLaunching}
                  submitDisabled={!(hasContent || attachments.attachments.length > 0) || !canSubmit}
                  submitLabel={t`Send message`}
                  onStop={
                    canInterruptStructuredTurn
                      ? handleInterrupt
                      : isStructuredLaunching
                        ? () => undefined
                        : undefined
                  }
                  {...(() => {
                    const renderExtras = () => (
                      <>
                        {showContextIndicator ? (
                          <ThreadContextIndicator
                            summary={contextSummary}
                            isOpen={contextDockOpen}
                            onToggle={() => setContextDockOpen((open) => !open)}
                          />
                        ) : null}
                        <ComposerAddMenu
                          mcpServers={mcpServers}
                          showFileOption={!isRemote}
                          onPickFiles={() => {
                            void readBridge()
                              .pickFiles()
                              .then((paths) => {
                                if (paths) attachments.addFiles(paths);
                              });
                          }}
                        />
                        {branchName ? (
                          // Marker span so the mobile stylesheet can drop the
                          // branch affordance (the PWA has its own git entry).
                          <span className="contents" data-composer-branch="">
                            {thread.worktreePath ? (
                              <Tooltip delay={0}>
                                <Tooltip.Trigger tabIndex={-1} role="none">
                                  <div className="lightcode-composer-static lightcode-composer-worktree min-w-0 max-w-48 px-2.5">
                                    <GitFork className="size-3.5 text-muted" />
                                    <span
                                      data-collapse-tier={3}
                                      className="lightcode-composer-label-hideable truncate"
                                    >
                                      {branchName}
                                    </span>
                                    {thread.prNumber ? (
                                      <span
                                        data-collapse-tier={3}
                                        className="lightcode-composer-label-hideable shrink-0 text-muted/60"
                                      >
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
                                showMoveBranchAction
                                {...(project?.scripts?.worktreeCopyPatterns
                                  ? {
                                      moveBranchCopyIgnoredPatterns:
                                        project.scripts.worktreeCopyPatterns,
                                    }
                                  : {})}
                                collapseTier={3}
                              />
                            )}
                          </span>
                        ) : null}
                      </>
                    );
                    const renderVoiceInput = () => (
                      <ComposerVoiceInput
                        show={showVoiceInputButton}
                        isDisabled={
                          authRequired ||
                          isSubmitting ||
                          !(showServerComposer || showTerminalComposer)
                        }
                        mentionRef={mentionRef}
                        voiceInputRef={voiceInputRef}
                      />
                    );
                    return isCliThread
                      ? { leadingControls: renderExtras, afterControls: renderVoiceInput }
                      : {
                          afterControls: () => (
                            <>
                              {renderExtras()}
                              {renderVoiceInput()}
                            </>
                          ),
                        };
                  })()}
                  onPromptChange={setPrompt}
                  {...(!isRemote ? { onAttachFiles: attachments.addFiles } : {})}
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
                aria-label={isComposerCollapsed ? t`Show composer` : t`Collapse composer`}
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
    </>
  );
}
