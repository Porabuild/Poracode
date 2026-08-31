import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "@heroui/react";
import { ChevronDown, Monitor, TerminalSquare, Webhook } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { AgentStatus, ProjectLocation, PromptSegment, Thread } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { agentStatusForPresentation, hasSelectableReasoning } from "@/shared/agentSelection";
import {
  changeThreadConfig,
  clearThreadPendingSteer,
} from "@/renderer/actions/threadRuntimeActions";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { AttachmentBar } from "../composer/AttachmentBar";
import { ComposerAddMenu } from "../composer/ComposerAddMenu";
import { ComposerVoiceInput } from "../composer/ComposerVoiceInput";
import {
  composerMcpServers,
  COMPUTER_USE_MCP_ID,
  providerOwnsMcpConfig,
} from "../composer/composerMcpServers";
import { openAttachmentLightbox } from "../composer/ImageLightbox";
import {
  pluginLabelsForMcpServers,
  pluginMentionsForAvailableMcp,
  withoutPluginBackedMcpMentions,
} from "../composer/pluginBackedMcp";
import { openPdfPreview } from "../pdf/openPdfPreview";
import {
  MentionInput,
  type McpMentionItem,
  type MentionInputHandle,
} from "../composer/MentionInput";
import { useThreadMentionItems } from "../composer/useThreadMentionItems";
import {
  storableAttachment,
  useAttachments,
  type SaveClipboardImage,
} from "../composer/useAttachments";
import type { VoiceInputHandle } from "../composer/VoiceInputButton";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { threadProductProperties } from "@/renderer/analytics/posthog";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import {
  useComposerInputInbox,
  worktreeComposerInboxKey,
} from "@/renderer/state/composerInputInbox";
import { useComposerUiStore } from "@/renderer/state/composerUiStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isDraftContentNonEmpty } from "@/renderer/state/slices/types";
import { selectActiveSubAgentParentItemIds } from "@/renderer/state/subAgentSelectors";
import { useThread } from "@/renderer/state/useThread";
import { ThreadChangesBubble } from "./ThreadChangesBubble";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import { ThreadContextIndicator } from "./ThreadContextIndicator";
import { getApprovalDenyOption } from "./ThreadRuntimeRequestPanel/helpers";
import { hasReportedContextUsage, resolveThreadContextUsageSummary } from "./threadContextUsage";
import { buildControls } from "./buildModelPickerControls";
import { machineKeyForLocation } from "@/shared/machines";
import { submitComposerPrompt } from "./threadComposerSubmit";
import {
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
} from "./threadSlashCommands";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";
import { resolveThreadAuthState, type ThreadErrorDockState } from "./threadErrorState";
import type { ThreadGoalDockState } from "./threadGoalState";
import type { ThreadTodoDockState } from "./threadTodoState";
import type { TerminalPaneHandle } from "./TerminalPane";
import { ThreadComposerDocks } from "./ThreadComposerDocks";
import {
  usePluginMentionItems,
  useSkillSlashCommands,
} from "@/renderer/components/skills/useSkills";
import { useDelayedPendingSteer } from "./useDelayedPendingSteer";

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
  pickFiles?: (() => Promise<string[] | null>) | undefined;
  saveClipboardImage?: SaveClipboardImage | undefined;
  /** Optional surface-specific placeholder for the active-thread input. */
  composerPlaceholder?: string | undefined;
  /** Override whether unmodified Enter submits instead of inserting a newline. */
  submitOnEnter?: boolean | undefined;
  /**
   * Override mount autofocus for the composer. Electron omits this and always
   * uses desktop behavior; the PWA supplies its desktop-pointer media-query
   * result so phone layouts do not summon the software keyboard.
   */
  autoFocusComposer?: boolean | undefined;
  /**
   * Suppress the informational docks (subagents/crossagents/workflows, context,
   * goal, plan, errors) inside the composer. The mobile PWA sets this and surfaces
   * the same state as compact chips above the floating composer instead
   * (ComposerInfoChips). The action docks are gated separately — see
   * {@link ThreadComposerSectionProps.hideActionDocks}.
   */
  hideInfoDocks?: boolean | undefined;
  /**
   * Suppress the action docks (auth required, pending steer, runtime requests)
   * because the host renders them itself. The mobile PWA sets this: its compact
   * composer clips to a single control line, so those docks are hoisted into the
   * floating dock above the bubble (ComposerActionDocks). The slash-command
   * panel stays inline — it only appears while the user is typing, i.e. with the
   * composer already expanded. Deny-with-feedback from the input keeps working
   * either way: this gates the panels, not the open request.
   */
  hideActionDocks?: boolean | undefined;
  onOpenProjectRelativePath?: ((path: string, lineNumber?: number) => void) | undefined;
  onTodoDockCollapsedChange: (collapsed: boolean) => void;
  onTodoDockPlacementChange: (placement: "composer" | "right") => void;
  onTodoDockRetire?: () => void;
};

export function ThreadComposerSection(props: ThreadComposerSectionProps) {
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  return <ThreadComposerSectionInner {...props} thread={thread} />;
}

type ComposerAfterControlsProps = {
  renderExtras: () => ReactNode;
  renderVoiceInput: () => ReactNode;
};

function ComposerAfterControls({ renderExtras, renderVoiceInput }: ComposerAfterControlsProps) {
  return (
    <>
      {renderExtras()}
      {renderVoiceInput()}
    </>
  );
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
  const awaitingWorktree = useAppStore(
    (state) =>
      state.provisioningWorktreeThreadIds[thread.id] === true && thread.status === "launching",
  );
  const isConnecting = useAppStore((state) => state.connectingThreadIds[thread.id] !== undefined);
  const { t } = useLingui();
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const isRemoteSurface = isRemoteSession();
  const usesRemoteTransport = isRemoteSurface || thread.remoteServerId !== undefined;
  const showVoiceInputButton =
    useSharedSettings((s) => s.audio.showVoiceInputButton) && !isRemoteSurface;
  const mentionRef = useRef<MentionInputHandle>(null);
  const voiceInputRef = useRef<VoiceInputHandle>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const attachments = useAttachments({
    ...(props.saveClipboardImage ? { saveClipboardImage: props.saveClipboardImage } : {}),
  });
  // Remote-thread attachments are stored on the paired desktop; resolve
  // previews through its image endpoint instead of the local-file protocol.
  const remoteDesktopId = thread.remoteServerId;
  const attachmentImageUrlForPath = remoteDesktopId
    ? (path: string) => useRemoteServersStore.getState().localImageUrl(remoteDesktopId, path)
    : undefined;
  // Unsent composer content survives leaving this thread. The primary GUI pane
  // keeps this section mounted across thread switches, so the thread-keyed
  // layout effects below save and restore without exposing another thread's
  // editor state for a paint.
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
  const composerSessionRef = useRef({ threadId: thread.id });
  if (composerSessionRef.current.threadId !== thread.id) {
    composerSessionRef.current = { threadId: thread.id };
  }
  const preparedThreadIdRef = useRef<string | null>(null);
  const restoredThreadIdRef = useRef<string | null>(null);
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
  const commandListId = useId();
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [controlOpenRequest, setControlOpenRequest] = useState<{
    target: "model" | "effort";
    nonce: number;
  } | null>(null);
  const [contextDockOpen, setContextDockOpen] = useState(false);
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const effectiveAgentStatus = agentStatus
    ? agentStatusForPresentation(agentStatus, presentationMode, thread.sessionRef)
    : undefined;
  const usesTerminalPresentation = presentationMode === "terminal";
  const appControlsEnabled =
    useSharedSettings((s) => s.disabledBuiltInMcpServers["app-controls"]) !== true;
  // Composer MCP servers are bound at session-create time for the active
  // thread, so the "+" menu shows this run's bindings read-only: the enabled
  // built-ins (from thread config), the custom servers recorded at launch,
  // and Computer Use. Users change servers in the draft composer or settings
  // before launching a new thread.
  // Bindings are display-only for an active session; toggles are no-ops.
  const providerOwnsMcp = effectiveAgentStatus
    ? providerOwnsMcpConfig(effectiveAgentStatus.capabilities)
    : false;
  const runtimeLaunchConfig = useAppStore((s) => s.runtimeLaunchConfigByThreadId[thread.id]);
  const effectiveMcpConfig = providerOwnsMcp
    ? (runtimeLaunchConfig ?? thread.config)
    : thread.config;
  const mcpServers = composerMcpServers.map((descriptor) => ({
    descriptor,
    enabled: effectiveMcpConfig?.[descriptor.configKey] === true,
    visible:
      descriptor.isAvailable(projectLocation) &&
      effectiveMcpConfig?.[descriptor.configKey] === true,
    onToggle: () => {},
  }));
  const launchCustomMcpNames = useAppStore(
    (s) => s.mcpLaunchCustomServerNamesByThreadId[thread.id],
  );
  const customMcpServers = (
    providerOwnsMcp && usesRemoteTransport ? [] : (launchCustomMcpNames ?? [])
  ).map((name) => ({
    id: name,
    name,
    enabled: true,
  }));
  const mcpMentions: McpMentionItem[] = [
    ...(appControlsEnabled && !providerOwnsMcp
      ? [
          {
            id: "app-controls",
            // Shortcut for one narrow use of the app-controls server: read the
            // Terminal panel. It sits next to the App Controls plugin rather
            // than being replaced by it — the plugin loads the full app skill.
            name: t`Terminal`,
            searchAliases: ["Terminal"],
            icon: TerminalSquare,
            keepAlongsidePlugin: true,
            enabled: true,
          },
        ]
      : []),
    ...composerMcpServers
      .filter(
        (descriptor) =>
          descriptor.isAvailable(projectLocation) &&
          effectiveMcpConfig?.[descriptor.configKey] === true,
      )
      .map((descriptor) => ({
        id: descriptor.id,
        name: t(descriptor.label),
        icon: descriptor.icon,
        enabled: true,
      })),
    ...customMcpServers.map((server) => ({
      id: server.id,
      name: server.name,
      icon: Webhook,
      enabled: true,
    })),
    ...(effectiveMcpConfig?.computerUse === true &&
    readBridge()?.platform !== "linux" &&
    projectLocation?.kind !== "wsl"
      ? [
          {
            id: COMPUTER_USE_MCP_ID,
            name: t`Computer Use`,
            icon: Monitor,
            enabled: true,
          },
        ]
      : []),
  ];
  const skillCommands = useSkillSlashCommands(projectLocation, thread.agentKind, presentationMode);
  const pluginMentions = usePluginMentionItems(projectLocation, thread.agentKind, presentationMode);
  // One row per tool: a plugin that wraps a built-in server replaces that
  // server's own mention instead of sitting next to an identical row, and only
  // while this thread actually carries that server.
  const composerPluginMentions = pluginMentionsForAvailableMcp(pluginMentions, mcpMentions);
  const composerMcpMentions = withoutPluginBackedMcpMentions(mcpMentions, composerPluginMentions);
  // The "+" menu names the same capability as the mention list: a server a
  // plugin packages reads as that plugin everywhere in the composer.
  const composerPluginLabels = pluginLabelsForMcpServers(composerPluginMentions);
  const threadMentionToolsAvailable = useAppStore(
    (s) => s.threadMentionToolsAvailableByThreadId[thread.id],
  );
  const threadMentions = useThreadMentionItems(
    {
      kind: "project",
      projectId: thread.projectId,
      currentWorktreePath: thread.worktreePath,
    },
    thread.id,
    threadMentionToolsAvailable,
  );
  const availableCommands = resolveAvailableSlashCommands(
    thread.slashCommands,
    effectiveAgentStatus?.capabilities.slashCommands,
    {
      agentKind: thread.agentKind,
      presentationMode,
      runtimeLabel: effectiveAgentStatus?.capabilities.runtimeLabel,
      hasEffort: hasSelectableReasoning(
        effectiveAgentStatus?.capabilities,
        thread.config?.model ?? "",
      ),
      supportsFast: effectiveAgentStatus
        ? supportsUsableFastMode(effectiveAgentStatus.capabilities, thread.config?.model ?? "")
        : false,
      skillCommands,
      disabledSkillNames: effectiveAgentStatus?.capabilities.disabledSkillNames,
      skillCatalogAuthoritative:
        effectiveAgentStatus?.capabilities.reportsSkillCatalog === true &&
        presentationMode === "gui" &&
        thread.slashCommands !== undefined,
    },
  );
  const filteredCommands = filterSlashCommands(availableCommands, slashQuery);
  const showCommandPanel = filteredCommands.length > 0;
  const { authRequired, hasRuntimeAuthError } = resolveThreadAuthState({
    authState: effectiveAgentStatus?.authState,
    errorDockStates,
  });
  const canShowRuntimeChrome = !usesTerminalPresentation || usesRemoteTransport;
  const isServerControlled =
    effectiveAgentStatus?.capabilities.liveInputMode === "server" || !usesTerminalPresentation;
  const isTerminalInput = effectiveAgentStatus?.capabilities.liveInputMode === "terminal";
  const needsFocusBeforeInput =
    effectiveAgentStatus?.capabilities.requiresTerminalFocusBeforeInput === true;
  const canQueueServerInput =
    isServerControlled &&
    !usesTerminalPresentation &&
    thread.sessionRef !== undefined &&
    thread.status === "working";
  const canSubmitServerInput =
    isServerControlled &&
    !isConnecting &&
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
  const hideInfoDocks = props.hideInfoDocks === true;
  const showTodoInComposer =
    !hideInfoDocks &&
    canShowRuntimeChrome &&
    todoDockState !== null &&
    todoDockPlacement === "composer";
  const showGoalInComposer = !hideInfoDocks && canShowRuntimeChrome && goalDockState !== null;
  const showErrorInComposer =
    !hideInfoDocks &&
    (!usesTerminalPresentation || usesRemoteTransport) &&
    errorDockStates.length > 0 &&
    !hasRuntimeAuthError;
  const hasActiveSubAgent = useAppStore(
    (s) =>
      !hideInfoDocks &&
      canShowRuntimeChrome &&
      selectActiveSubAgentParentItemIds(s, thread.id).length > 0,
  );
  const collapseTerminalComposerSetting = useSharedSettings((s) => s.collapseTerminalComposer);
  const [composerCollapsed, setComposerCollapsed] = useState(collapseTerminalComposerSetting);
  const canCollapseComposer = showTerminalComposer && !isRemoteSurface;
  const isComposerCollapsed = canCollapseComposer && composerCollapsed;
  const shouldAutoFocusComposer =
    paneCount === 1 && !isComposerCollapsed && (props.autoFocusComposer ?? !isRemoteSurface);
  const setComposerUi = useComposerUiStore((s) => s.setComposerUi);
  const branchName = useGitStore(
    (s) =>
      thread.worktreeBranch ??
      (thread.worktreePath
        ? s.worktreeStatuses[thread.worktreePath]?.branch
        : s.statuses[thread.projectId]?.branch),
  );
  const hiddenModelIds = useSharedSettings(
    (s) =>
      s.hiddenModels[
        modelVisibilityKey(
          thread.agentKind,
          presentationMode,
          effectiveAgentStatus?.capabilities.runtimeLabel,
        )
      ],
  );
  const modelPreferences = useSharedSettings((s) => s.providerModelPreferences[thread.agentKind]);
  const setProviderModelPreference = useSharedSettings((s) => s.setProviderModelPreference);
  const controls = buildControls(
    thread,
    effectiveAgentStatus,
    hiddenModelIds,
    (config) => changeThreadConfig(thread.id, config),
    modelPreferences,
    (model, preference) => setProviderModelPreference(thread.agentKind, model, preference),
    machineKeyForLocation(projectLocation),
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
  const pendingSteer = useAppStore((s) => s.pendingSteerByThreadId[thread.id]);
  const visiblePendingSteer = useDelayedPendingSteer(pendingSteer);
  const usesPendingSteerPath =
    !isConnecting && !usesTerminalPresentation && thread.status === "working";
  const runtimeRequests = useAppStore((s) => s.runtimeRequestsByThread[thread.id]);
  const activeRuntimeRequest = canShowRuntimeChrome ? runtimeRequests?.[0] : undefined;
  const approvalDenyOption = activeRuntimeRequest
    ? getApprovalDenyOption(activeRuntimeRequest)
    : undefined;
  // Gate the inline docks only. `activeRuntimeRequest` still drives the
  // composer's deny-with-feedback submit path, and `authRequired` still disables
  // submit/voice, when a host renders these docks itself.
  const hideActionDocks = props.hideActionDocks === true;
  const composerRuntimeRequest = hideActionDocks ? undefined : activeRuntimeRequest;
  const composerPendingSteer = hideActionDocks ? undefined : visiblePendingSteer;
  const showAuthInComposer = authRequired && !hideActionDocks;
  const reportedContextUsage = useAppStore((s) =>
    canShowRuntimeChrome ? s.runtimeContextByThread[thread.id] : undefined,
  );
  const contextSummary = resolveThreadContextUsageSummary({
    thread,
    agentStatus: effectiveAgentStatus,
    reportedUsage: reportedContextUsage,
  });
  const showContextIndicator =
    !hideInfoDocks &&
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
    void readBridge()
      .interruptThread({ threadId: thread.id })
      .then(() => {
        captureProductEvent("thread.interrupted", threadProductProperties(thread));
      })
      .catch((error: unknown) => {
        setIsInterrupting(false);
        console.error("[thread] failed to interrupt turn", error);
        toast.danger(friendlyError(error));
      });
  }

  function writeTerminalInput(data: string) {
    return readBridge().writeTerminal({ threadId: thread.id, data });
  }

  function submitPrompt(segments: PromptSegment[]) {
    const composerSession = composerSessionRef.current;
    submitComposerPrompt(segments, {
      thread,
      agentStatus: effectiveAgentStatus,
      presentationMode,
      usesTerminalPresentation,
      canSubmit,
      usesPendingSteerPath,
      needsFocusBeforeInput,
      activeRuntimeRequest,
      approvalDenyOption,
      availableCommands,
      attachments,
      mentionRef,
      terminalPaneRef: props.terminalPaneRef,
      latestSegmentsRef,
      submittedRef,
      isCurrentSession: () => composerSessionRef.current === composerSession,
      setPrompt,
      setHasContent,
      setIsSubmitting,
      requestOpenControl: (target) =>
        setControlOpenRequest((prev) => ({ target, nonce: (prev?.nonce ?? 0) + 1 })),
      onSubmitInput: props.onSubmitInput,
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

  // Restore an unsent draft saved the last time this thread's composer was
  // active. useLayoutEffect runs before paint so the previous thread's editor
  // content is cleared before the new thread is visible. Consume the entry so
  // a later real send doesn't resurrect it.
  //
  // A terminal thread that is still `launching` hides the whole composer (so the
  // MentionInput — and `mentionRef` — does not exist yet). Restoring into a null
  // editor would silently drop the text while still consuming the stored draft,
  // so defer until the editor mounts; the effect re-runs when `editorMounted`
  // flips, at which point `mentionRef` is attached.
  const editorMounted = !usesTerminalPresentation || thread.status !== "launching";
  const pendingComposerInputs = useComposerInputInbox((s) => s.itemsByComposer[thread.id]);
  const fallbackComposerInboxKey = thread.worktreePath
    ? worktreeComposerInboxKey(thread.projectId, thread.worktreePath)
    : `draft:${thread.projectId}`;
  const pendingFallbackComposerInputs = useComposerInputInbox(
    (s) => s.itemsByComposer[fallbackComposerInboxKey],
  );
  useLayoutEffect(() => {
    if (preparedThreadIdRef.current !== thread.id) {
      preparedThreadIdRef.current = thread.id;
      mentionRef.current?.clear();
      latestSegmentsRef.current = [];
      attachments.clearAll();
      submittedRef.current = false;
      setPrompt("");
      setHasContent(false);
      setIsSubmitting(false);
      setIsInterrupting(false);
      setSlashQuery(null);
      setSlashActiveIndex(0);
      setControlOpenRequest(null);
      setContextDockOpen(false);
      setComposerCollapsed(collapseTerminalComposerSetting);
    }
    if (restoredThreadIdRef.current === thread.id || !editorMounted) return;
    restoredThreadIdRef.current = thread.id;
    const saved = useAppStore.getState().threadDraftContents[thread.id];
    if (!saved) return;
    if (saved.segments.length > 0) {
      mentionRef.current?.restoreFromSegments(saved.segments);
      latestSegmentsRef.current = saved.segments;
    }
    if (saved.attachments.length > 0) {
      attachments.restore(saved.attachments);
    }
    clearThreadDraftContent(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset/restore is keyed to the active thread and editor mount; attachment/editor methods are read from this render
  }, [editorMounted, thread.id]);

  useEffect(() => {
    const composer = mentionRef.current;
    if (
      isSubmitting ||
      !editorMounted ||
      !composer ||
      (!pendingComposerInputs?.length && !pendingFallbackComposerInputs?.length)
    ) {
      return;
    }
    let composerHasContent = composer.serializeSegments().length > 0;
    for (const key of [fallbackComposerInboxKey, thread.id]) {
      const items = useComposerInputInbox.getState().drain(key);
      for (const segments of items) {
        const separator: PromptSegment[] = composerHasContent
          ? [{ kind: "text", content: "\n\n" }]
          : [];
        composer.insertSegments([...separator, ...segments], { atEnd: true, focus: false });
        composerHasContent = true;
      }
    }
  }, [
    editorMounted,
    fallbackComposerInboxKey,
    isSubmitting,
    pendingComposerInputs,
    pendingFallbackComposerInputs,
    thread.id,
  ]);

  useEffect(() => {
    setComposerCollapsed(collapseTerminalComposerSetting);
  }, [collapseTerminalComposerSetting]);

  // Save whatever is left in the composer when this thread's section unmounts
  // (navigating to another thread/pane). A cleared composer leaves both refs
  // empty, so a just-sent message is not re-saved; an in-flight submit is
  // skipped via submittedRef because its text has already been handed off.
  useLayoutEffect(() => {
    const tid = thread.id;
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reading the latest refs at unmount is the point: they mirror the live composer state
      if (submittedRef.current) return;
      // Stash path-only attachment copies: `previewUrl` object URLs belong to
      // this composer's live session and are revoked when it clears/unmounts.
      const content = {
        segments: latestSegmentsRef.current,
        attachments: attachmentsRef.current.map(storableAttachment),
      };
      if (isDraftContentNonEmpty(content)) {
        saveThreadDraftContent(tid, content);
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
    window.addEventListener("poracode:paste-to-composer", handlePasteToComposer);
    return () => window.removeEventListener("poracode:paste-to-composer", handlePasteToComposer);
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
    if (pendingComposerFocusThreadId !== thread.id || isComposerCollapsed) return;
    const raf = requestAnimationFrame(() => {
      mentionRef.current?.focus();
      useAppStore.getState().clearComposerFocusRequest(thread.id);
    });
    return () => cancelAnimationFrame(raf);
  }, [isComposerCollapsed, pendingComposerFocusThreadId, thread.id]);

  return (
    <>
      {thread.status !== "launching" || !usesTerminalPresentation ? (
        <div className="relative">
          {awaitingWorktree ? null : (
            <ThreadChangesBubble
              projectId={thread.projectId}
              {...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {})}
              {...(thread.worktreePath && branchName ? { worktreeName: branchName } : {})}
            />
          )}
          <div
            className={`grid transition-[grid-template-rows] ease-[cubic-bezier(0.16,1,0.3,1)] ${isComposerCollapsed ? "duration-300" : "duration-200"}`}
            style={{ gridTemplateRows: isComposerCollapsed ? "0fr" : "1fr" }}
          >
            {/* Bottom-anchor the shell inside the clip so collapsing slides it
                down like a drawer instead of chopping off its bottom border. */}
            <div className="flex min-h-0 flex-col justify-end overflow-hidden">
              <div
                className={`relative ${isComposerCollapsed ? "pointer-events-none" : ""}`}
                style={{
                  opacity: isComposerCollapsed ? 0 : 1,
                  // Fade over the same window as the height transition so the
                  // collapse reads as one motion, not height-then-border steps.
                  transition: isComposerCollapsed
                    ? "opacity 300ms cubic-bezier(0.16,1,0.3,1)"
                    : "opacity 200ms cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <ThreadComposer
                  autoFocus={shouldAutoFocusComposer} // eslint-disable-line jsx-a11y/no-autofocus -- Electron is always desktop; the PWA enables this only for desktop-like input
                  compact
                  toolbarLayoutKey={[
                    isCliThread ? "cli" : "chat",
                    showContextIndicator ? "ctx" : "no-ctx",
                    authRequired ? "auth-required" : "auth-ready",
                  ].join("|")}
                  fixedContent={
                    hasActiveSubAgent ||
                    showContextInComposer ||
                    showErrorInComposer ||
                    showGoalInComposer ||
                    showTodoInComposer ||
                    showAuthInComposer ||
                    composerPendingSteer ||
                    composerRuntimeRequest ||
                    showCommandPanel ? (
                      <ThreadComposerDocks
                        hasActiveSubAgent={hasActiveSubAgent}
                        showContextInComposer={showContextInComposer}
                        showErrorInComposer={showErrorInComposer}
                        showGoalInComposer={showGoalInComposer}
                        showTodoInComposer={showTodoInComposer}
                        authRequired={showAuthInComposer}
                        showCommandPanel={showCommandPanel}
                        threadId={thread.id}
                        projectLocation={projectLocation}
                        threadConfig={thread.config}
                        worktreePath={thread.worktreePath}
                        branchName={branchName}
                        agentStatus={effectiveAgentStatus}
                        project={project}
                        contextSummary={contextSummary}
                        errorDockStates={errorDockStates}
                        goalDockState={goalDockState}
                        todoDockState={todoDockState}
                        todoDockCollapsed={todoDockCollapsed}
                        todoDockPlacement={todoDockPlacement}
                        pendingSteer={composerPendingSteer}
                        activeRuntimeRequest={composerRuntimeRequest}
                        filteredCommands={filteredCommands}
                        slashActiveIndex={slashActiveIndex}
                        commandListId={commandListId}
                        onCloseContextDock={() => setContextDockOpen(false)}
                        onDismissError={props.onDismissError}
                        onGoalDockDismiss={props.onGoalDockDismiss}
                        onTodoDockCollapsedChange={props.onTodoDockCollapsedChange}
                        onTodoDockPlacementChange={props.onTodoDockPlacementChange}
                        {...(props.onTodoDockRetire
                          ? { onTodoDockRetire: props.onTodoDockRetire }
                          : {})}
                        onCancelPendingSteer={() => clearThreadPendingSteer(thread.id)}
                        {...(props.onOpenProjectRelativePath
                          ? { onOpenProjectRelativePath: props.onOpenProjectRelativePath }
                          : {})}
                        onSlashActiveIndexChange={setSlashActiveIndex}
                        onSelectCommand={(cmd) => {
                          mentionRef.current?.insertSlashCommand(cmd);
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
                        if (idx >= 0) {
                          openAttachmentLightbox(imageAttachments, idx, attachmentImageUrlForPath);
                        }
                      }}
                      onPreviewPdf={(att) => openPdfPreview(att.path)}
                      {...(attachmentImageUrlForPath
                        ? { imageUrlForPath: attachmentImageUrlForPath }
                        : {})}
                    />
                  }
                  inputContent={
                    <MentionInput
                      ref={mentionRef}
                      autoFocus={shouldAutoFocusComposer} // eslint-disable-line jsx-a11y/no-autofocus -- Electron is always desktop; the PWA enables this only for desktop-like input
                      compact
                      disabled={!(showServerComposer || showTerminalComposer)}
                      placeholder={
                        approvalDenyOption
                          ? t`Deny and tell the agent what to do differently…`
                          : isServerControlled
                            ? (props.composerPlaceholder ??
                              t`Ask ${effectiveAgentStatus?.label ?? agentFallbackLabel} anything about this workspace`)
                            : t`Send a message...`
                      }
                      projectLocation={projectLocation}
                      submitOnEnter={props.submitOnEnter ?? !isRemoteSurface}
                      {...(showCommandPanel
                        ? {
                            commandListId,
                            commandActiveDescendant: `${commandListId}-option-${slashActiveIndex}`,
                          }
                        : {})}
                      projectId={thread.projectId}
                      mcpMentions={composerMcpMentions}
                      pluginMentions={composerPluginMentions}
                      threadMentions={threadMentions}
                      onTextChange={(hasText) => {
                        setHasContent(hasText);
                        latestSegmentsRef.current = mentionRef.current?.serializeSegments() ?? [];
                      }}
                      onSubmit={submitPrompt}
                      onPasteImage={(file: File) => {
                        void attachments
                          .addClipboardImage(file, thread.id)
                          .catch((error: unknown) => toast.danger(friendlyError(error)));
                      }}
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
                            void writeTerminalInput("\x1b[Z").catch((error: unknown) => {
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
                            void writeTerminalInput("\x14").catch((error: unknown) => {
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
                  stopPending={isInterrupting}
                  submitDisabled={!(hasContent || attachments.attachments.length > 0) || !canSubmit}
                  submitLabel={t`Send message`}
                  onStop={canInterruptStructuredTurn ? handleInterrupt : undefined}
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
                          customMcpServers={customMcpServers}
                          pluginLabels={composerPluginLabels}
                          readOnly
                          computerUse={{
                            enabled: effectiveMcpConfig?.computerUse === true,
                            visible:
                              effectiveMcpConfig?.computerUse === true &&
                              readBridge()?.platform !== "linux" &&
                              projectLocation?.kind !== "wsl",
                            onToggle: () => {},
                          }}
                          showFileOption={!usesRemoteTransport || props.pickFiles !== undefined}
                          onPickFiles={() => {
                            void (
                              props.pickFiles
                                ? props.pickFiles()
                                : readBridge().pickFiles({ attachmentThreadId: thread.id })
                            )
                              .then((paths) => {
                                if (paths) attachments.addFiles(paths);
                              })
                              .catch((error: unknown) => toast.danger(friendlyError(error)));
                          }}
                        />
                      </>
                    );
                    const renderVoiceInput = () => (
                      <ComposerVoiceInput
                        key={thread.id}
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
                          afterControls: (
                            <ComposerAfterControls
                              renderExtras={renderExtras}
                              renderVoiceInput={renderVoiceInput}
                            />
                          ),
                        };
                  })()}
                  onPromptChange={setPrompt}
                  {...(!usesRemoteTransport ? { onAttachFiles: attachments.addFiles } : {})}
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
