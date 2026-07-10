import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Tooltip, toast } from "@heroui/react";
import { Download, Monitor, Webhook, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentHookPluginStatus,
  AgentStatus,
  Project,
  PromptSegment,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { hookEnvForProject, hookEnvKey } from "@/shared/agentHookPluginEnv";
import { isHomeProjectId } from "@/shared/homeScope";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import {
  AttachmentBar,
  ComposerAddMenu,
  composerMcpServers,
  COMPUTER_USE_MCP_ID,
  ComputerUseChip,
  McpChip,
  mcpTogglePatch,
  ComposerVoiceInput,
  MentionInput,
  openAttachmentLightbox,
  type ComposerMcpMenuItem,
  type McpMentionItem,
  type MentionInputHandle,
  type VoiceInputHandle,
  useAttachments,
} from "@/renderer/components/composer";
import { getComputerUseScope } from "@/renderer/components/composer/computerUseScope";
import { useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";
import {
  BranchSelector,
  Button,
  PixelLoader,
  generateWorktreeBranch,
  type BranchSelection,
} from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isDraftContentNonEmpty } from "@/renderer/state/slices/types";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import { ThreadAgentUpdateDock } from "./ThreadAgentUpdateDock";
import { ThreadAuthRequiredDock } from "./ThreadAuthRequiredDock";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import {
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
} from "./threadSlashCommands";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";
import { WorktreeModeSelect, type WorktreeMode } from "./WorktreeModeSelect";

// Optional fields admit explicit `undefined` so wire shapes with
// `prop?: T | undefined` (e.g. the zod-parsed quick-composer submission)
// pass through without field-by-field copying.
export type DraftStartInput = {
  agentKind: AgentStatus["kind"];
  config: ThreadConfig;
  prompt: string;
  segments?: PromptSegment[] | undefined;
  existingWorktreePath?: string | undefined;
  worktreeBranch?: string | undefined;
  worktreeBaseBranch?: string | undefined;
  worktreeIsNewBranch?: boolean | undefined;
  worktreeTransferUncommitted?: boolean | undefined;
  presentationMode?: ThreadPresentationMode | undefined;
};

function HookInstallProposal(props: {
  project: Project;
  selectedAgent: AgentStatus;
  presentationMode: ThreadPresentationMode;
}) {
  const { t } = useLingui();
  const env = hookEnvForProject(props.project);
  const envKey = hookEnvKey(env);
  const agentKind = props.selectedAgent.kind;
  const proposalKey = `${agentKind}:${envKey}`;
  const dismissed = useSharedSettings((s) => s.dismissedHookInstallProposals[proposalKey] === true);
  const dismissHookInstallProposal = useSharedSettings((s) => s.dismissHookInstallProposal);
  const [status, setStatus] = useState<AgentHookPluginStatus | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (
      props.presentationMode !== "terminal" ||
      dismissed ||
      typeof window === "undefined" ||
      !window.lightcode?.getAgentHookPluginStatuses
    ) {
      setStatus(undefined);
      return;
    }
    const requestEnv = env;
    let cancelled = false;
    readBridge()
      .getAgentHookPluginStatuses({ agentKind, envs: [requestEnv] })
      .then((statuses) => {
        if (!cancelled) setStatus(statuses[0]);
      })
      .catch(() => {
        if (!cancelled) setStatus(undefined);
      });
    return () => {
      cancelled = true;
    };
    // `env` is keyed by `envKey` (a string) — depend on the key, not the
    // freshly-built env object, to avoid re-firing the IPC on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed, props.presentationMode, agentKind, envKey]);

  if (
    dismissed ||
    props.presentationMode !== "terminal" ||
    !status ||
    !status.supported ||
    status.installed
  ) {
    return null;
  }

  const install = () => {
    setPending(true);
    readBridge()
      .installAgentHookPlugin({ agentKind: props.selectedAgent.kind, env })
      .then((result) => {
        setStatus(result.status);
        toast.success(t`${props.selectedAgent.label} hooks installed.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error
            ? error.message
            : t`Unable to install ${props.selectedAgent.label} hooks.`,
        ),
      )
      .finally(() => setPending(false));
  };

  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel={t`Install CLI hooks`}>
      <ThreadDockHeader
        icon={Webhook}
        iconClassName="text-foreground"
        title={t`Install CLI hooks`}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs text-foreground"
              isDisabled={pending}
              isPending={pending}
              onPress={install}
            >
              {pending ? <PixelLoader size="xs" /> : <Download className="size-3.5" />}
              <Trans>Install</Trans>
            </Button>
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <button
                  aria-label={t`Don't show hook install proposal`}
                  className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                  type="button"
                  onClick={() => dismissHookInstallProposal(proposalKey)}
                >
                  <X className="size-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Trans>Dismiss</Trans>
              </Tooltip.Content>
            </Tooltip>
          </div>
        }
      >
        <span className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]">
          <Trans>Better status updates while agents run.</Trans>
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}

function DraftComposerAfterControls(props: {
  mcpServers: readonly ComposerMcpMenuItem[];
  isRemote: boolean;
  onPickFiles: () => void;
  showVoiceInputButton: boolean;
  isDisabled: boolean;
  mentionRef: RefObject<MentionInputHandle | null>;
  voiceInputRef: RefObject<VoiceInputHandle | null>;
  computerUse: {
    enabled: boolean;
    visible: boolean;
    onToggle: (next: boolean) => void;
  };
}) {
  return (
    <>
      <ComposerAddMenu
        mcpServers={props.mcpServers}
        showFileOption={!props.isRemote}
        onPickFiles={props.onPickFiles}
        computerUse={props.computerUse}
      />
      <ComposerVoiceInput
        show={props.showVoiceInputButton}
        isDisabled={props.isDisabled}
        mentionRef={props.mentionRef}
        voiceInputRef={props.voiceInputRef}
      />
    </>
  );
}

export function ThreadDraftComposerArea(props: {
  project: Project;
  paneId?: string;
  selectedAgent: AgentStatus;
  controls: ComposerControl[];
  config: ThreadConfig;
  compact: boolean | undefined;
  paneCount: number | undefined;
  gitBranch: string | undefined;
  worktreeMode: boolean;
  supportsModePicker: boolean;
  presentationMode: ThreadPresentationMode;
  placeholder?: string;
  pickFiles?: () => Promise<string[] | null>;
  onConfigChange: (patch: Partial<ThreadConfig>) => void;
  onWorktreeModeChange: (worktreeMode: boolean) => void;
  onSwitchBranch: (branch: string, createNew: boolean) => void;
  onRememberPresentationMode: () => void;
  onStart: (input: DraftStartInput) => void | Promise<void>;
}) {
  const { t } = useLingui();
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  // Set to true while an agent-binary update is running for this project's env.
  // Locks the composer Send so the user can't fire a thread mid-upgrade — the
  // launched agent would race with the still-running install and could pick up
  // either binary, which is a confusing state to debug.
  const [agentUpdating, setAgentUpdating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRemote = isRemoteSession();
  const showVoiceInputButton = useSharedSettings((s) => s.audio.showVoiceInputButton) && !isRemote;
  // Persistent (standing-default) composer MCP enablement, keyed by MCP id.
  const persistentMcpServers = useSharedSettings((s) => s.enabledMcpServers);
  const setMcpServerEnabled = useSharedSettings((s) => s.setMcpServerEnabled);
  const mentionRef = useRef<MentionInputHandle>(null);
  const voiceInputRef = useRef<VoiceInputHandle>(null);
  const attachments = useAttachments();
  const inboxKey = props.paneId ?? `draft:${props.project.id}`;
  const pendingPickedAttachments = useBrowserAttachInbox((s) =>
    inboxKey ? s.itemsByThread[inboxKey] : undefined,
  );
  const addPickedRef = useRef(attachments.addPicked);
  addPickedRef.current = attachments.addPicked;
  useEffect(() => {
    if (!inboxKey) return;
    if (!pendingPickedAttachments || pendingPickedAttachments.length === 0) return;
    const drained = useBrowserAttachInbox.getState().drain(inboxKey);
    for (const item of drained) {
      addPickedRef.current({
        path: item.attachmentPath,
        name: item.attachmentName,
        mimeType: item.mimeType,
        selector: item.selector,
        sourceUrl: item.sourceUrl,
      });
    }
  }, [pendingPickedAttachments, inboxKey]);
  const [branchSelection, setBranchSelection] = useState<BranchSelection | null>(
    () => useAppStore.getState().pendingDraftWorktreeSelections[props.project.id] ?? null,
  );
  const pendingWorktreeSelection = useAppStore(
    (s) => s.pendingDraftWorktreeSelections[props.project.id],
  );
  const pendingComposerSeed = useAppStore((s) => s.pendingComposerSeeds[props.project.id]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [controlOpenRequest, setControlOpenRequest] = useState<{
    target: "model" | "effort";
    nonce: number;
  } | null>(null);
  const saveDraftContent = useAppStore((s) => s.saveDraftContent);
  const clearDraftContent = useAppStore((s) => s.clearDraftContent);
  const latestSegmentsRef = useRef<PromptSegment[]>([]);
  const attachmentsRef = useRef(attachments.attachments);
  attachmentsRef.current = attachments.attachments;
  const submittedRef = useRef(false);
  const initialDraftRef = useRef(useAppStore.getState().draftContents[props.project.id]);
  const availableCommands = resolveAvailableSlashCommands(
    undefined,
    props.selectedAgent.capabilities.slashCommands,
    {
      agentKind: props.selectedAgent.kind,
      presentationMode: props.presentationMode,
      hasEffort:
        ((
          props.selectedAgent.capabilities.modelEfforts?.[props.config.model] ??
          props.selectedAgent.capabilities.efforts ??
          []
        ).length ?? 0) > 0,
      supportsFast: supportsUsableFastMode(props.selectedAgent.capabilities, props.config.model),
    },
  );
  const filteredCommands = filterSlashCommands(availableCommands, slashQuery);
  const showCommandPanel = filteredCommands.length > 0;
  const authRequired = props.selectedAgent.authState === "missing";
  const isHomeScope = isHomeProjectId(props.project.id);
  // Registry-driven MCP toggles. The "+" add menu now flips the *persistent*
  // enablement (a standing default applied to every new thread), keyed by MCP
  // id — not the per-thread config flag. A new MCP server means adding one
  // descriptor to the registry.
  const mcpServers = composerMcpServers.map((descriptor) => ({
    descriptor,
    enabled: persistentMcpServers[descriptor.id] === true,
    visible:
      descriptor.getScope(
        props.selectedAgent.capabilities,
        props.presentationMode,
        props.project.location,
      ) !== "none",
    onToggle: (next: boolean) => setMcpServerEnabled(descriptor.id, next),
  }));
  // Composer chips represent per-thread *mentions* only: a server whose config
  // flag is on for this draft but that isn't persistently enabled. Persistently
  // enabled servers are on for every thread and show no chip.
  const mentionedMcpServers = composerMcpServers.filter(
    (descriptor) =>
      props.config[descriptor.configKey] === true && persistentMcpServers[descriptor.id] !== true,
  );

  // Worktree creation lives in the composer toolbar. The "bring over uncommitted
  // changes" affordance only appears when the new worktree forks from the
  // current (dirty) checkout — the only case where transferring is meaningful.
  const projectStatus = useGitStore((s) => s.statuses[props.project.id]);
  const hasUncommittedChanges =
    !!projectStatus && projectStatus.staged.length + projectStatus.unstaged.length > 0;
  const worktreeBase = branchSelection?.baseBranch ?? branchSelection?.branch ?? props.gitBranch;
  // The worktree dropdown's "+ changes" choice is offered whenever the current
  // (dirty) checkout would be the worktree's fork point — independent of whether
  // worktree mode is already on, since selecting it also turns worktree mode on.
  const canBringChanges = hasUncommittedChanges && worktreeBase === props.gitBranch;
  // Transferring is only meaningful once worktree mode is actually on.
  const canTransferUncommitted = props.worktreeMode && canBringChanges;
  const shouldTransferUncommitted =
    canTransferUncommitted && branchSelection?.transferUncommitted === true;

  const worktreeSelected = branchSelection?.isWorktree ?? props.worktreeMode;
  const worktreeMode: WorktreeMode = !worktreeSelected
    ? "none"
    : shouldTransferUncommitted
      ? "new-with-changes"
      : "new";

  function selectNewWorktree(overrides?: Partial<BranchSelection>) {
    const base = worktreeBase ?? props.gitBranch ?? "";
    setBranchSelection({ branch: base, baseBranch: base, isWorktree: true, ...overrides });
  }

  function handleWorktreeModeChange(mode: WorktreeMode) {
    if (mode === "none") {
      props.onWorktreeModeChange(false);
      setBranchSelection(null);
      return;
    }
    props.onWorktreeModeChange(true);
    // Keep an existing worktree selection (e.g. a worktreePath from "New thread
    // in worktree") intact rather than rebuilding it into a brand-new branch.
    if (branchSelection?.worktreePath) return;
    selectNewWorktree({ transferUncommitted: mode === "new-with-changes" });
  }

  const computerUseScope = getComputerUseScope(
    props.selectedAgent.capabilities,
    props.presentationMode,
    props.project.location,
    readBridge()?.platform,
  );
  const computerUseEnabled = props.config.computerUse === true;
  const computerUsePersistent = persistentMcpServers[COMPUTER_USE_MCP_ID] === true;
  // Same chip rule as the registry servers: a chip only for a per-thread mention,
  // never for the persistent standing default.
  const showComputerUseChip =
    computerUseScope !== "none" && computerUseEnabled && !computerUsePersistent;
  const onConfigChange = props.onConfigChange;
  // `@`-mention affordances: disabled servers enable the capability for this
  // draft; already-effective servers remain available and insert a textual
  // mention that directs the agent to use them for this turn.
  const mcpMentions: McpMentionItem[] = [
    ...composerMcpServers
      .filter(
        (descriptor) =>
          descriptor.getScope(
            props.selectedAgent.capabilities,
            props.presentationMode,
            props.project.location,
          ) !== "none",
      )
      .map((descriptor) => ({
        id: descriptor.id,
        name: t(descriptor.label),
        icon: descriptor.icon,
        detail: t`MCP server`,
        enabled: props.config[descriptor.configKey] === true,
      })),
    ...(computerUseScope !== "none"
      ? [
          {
            id: COMPUTER_USE_MCP_ID,
            name: t`Computer Use`,
            icon: Monitor,
            detail: t`Computer Use`,
            enabled: computerUseEnabled,
          },
        ]
      : []),
  ];
  const onMcpMentionSelect = (id: string) => {
    if (id === COMPUTER_USE_MCP_ID) {
      onConfigChange({ computerUse: true });
      return;
    }
    const descriptor = composerMcpServers.find((server) => server.id === id);
    if (descriptor) onConfigChange(mcpTogglePatch(descriptor.configKey, true));
  };
  const controls: ComposerControl[] = controlOpenRequest
    ? props.controls.map((control) => {
        if (controlOpenRequest.target === "model" && control.kind === "provider-model") {
          return { ...control, openSignal: controlOpenRequest.nonce };
        }
        if (controlOpenRequest.target === "effort" && control.kind === "effort-context") {
          return { ...control, openSignal: controlOpenRequest.nonce };
        }
        return control;
      })
    : props.controls;
  const controlKinds = controls.map((control) => control.kind ?? "menu").join(",");
  const toolbarLayoutKey = [
    props.selectedAgent.kind,
    props.presentationMode,
    props.config.model,
    props.config.effort ?? "",
    props.config.contextSize ?? "",
    props.selectedAgent.capabilities.fastModels?.includes(props.config.model)
      ? "fast-control"
      : "no-fast-control",
    props.gitBranch ?? "",
    props.worktreeMode ? "worktree" : "branch",
    authRequired ? "auth-required" : "auth-ready",
    branchSelection?.branch ?? "",
    branchSelection?.baseBranch ?? "",
    branchSelection?.isWorktree ? "selection-worktree" : "selection-branch",
    canTransferUncommitted ? "can-transfer" : "no-transfer",
    controlKinds,
  ].join("|");

  useEffect(() => {
    if (computerUseScope === "none" && computerUseEnabled) {
      onConfigChange({ computerUse: false });
    }
  }, [computerUseScope, computerUseEnabled, onConfigChange]);

  function resetDraftRefs() {
    latestSegmentsRef.current = [];
    attachmentsRef.current = [];
  }

  function submitSegments(allSegments: PromptSegment[], fallbackPrompt = "") {
    const flatPrompt = flattenSegments(allSegments) || fallbackPrompt.trim();
    if (flatPrompt.length === 0) {
      return;
    }
    const localAction = resolveLocalSlashCommandAction(flatPrompt, {
      agentKind: props.selectedAgent.kind,
      presentationMode: props.presentationMode,
    });
    if (localAction?.kind === "set-mode") {
      props.onConfigChange({ mode: localAction.mode });
      mentionRef.current?.clear();
      setPrompt("");
      setHasContent(false);
      resetDraftRefs();
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
      resetDraftRefs();
      return;
    }
    if (localAction?.kind === "toggle-fast") {
      if (supportsUsableFastMode(props.selectedAgent.capabilities, props.config.model)) {
        props.onConfigChange({ fast: props.config.fast !== true });
      }
      mentionRef.current?.clear();
      setPrompt("");
      setHasContent(false);
      resetDraftRefs();
      return;
    }
    if (authRequired) {
      return;
    }

    resetDraftRefs();
    submittedRef.current = true;
    setIsSubmitting(true);
    const useWorktree = branchSelection?.isWorktree ?? props.worktreeMode;
    if (props.supportsModePicker) {
      props.onRememberPresentationMode();
    }
    const startResult = props.onStart({
      agentKind: props.selectedAgent.kind,
      config: props.config,
      prompt: flatPrompt,
      ...(allSegments.length > 0 ? { segments: allSegments } : {}),
      presentationMode: props.presentationMode,
      ...(useWorktree
        ? branchSelection?.worktreePath
          ? {
              existingWorktreePath: branchSelection.worktreePath,
              worktreeBranch: branchSelection.branch,
            }
          : {
              worktreeBranch: generateWorktreeBranch(),
              ...(branchSelection?.baseBranch
                ? { worktreeBaseBranch: branchSelection.baseBranch }
                : {}),
              worktreeIsNewBranch: true,
              ...(shouldTransferUncommitted ? { worktreeTransferUncommitted: true } : {}),
            }
        : {}),
    });
    // On success the draft pane unmounts (replaced by the launched thread), so
    // this state never matters. On failure (e.g. worktree creation errored) the
    // pane stays mounted — re-enable the composer instead of leaving it stuck on
    // the launch spinner with the user's prompt trapped behind it. `onStart` may
    // return void or a promise; Promise.resolve normalizes both.
    void Promise.resolve(startResult).catch(() => {
      submittedRef.current = false;
      // resetDraftRefs() above cleared the snapshot the unmount-cleanup save
      // reads. The prompt is still in the editor, so re-capture it — otherwise
      // navigating away without another edit would silently drop it.
      latestSegmentsRef.current = mentionRef.current?.serializeSegments() ?? [];
      attachmentsRef.current = attachments.attachments;
      setIsSubmitting(false);
    });
  }

  useLayoutEffect(() => {
    const saved = initialDraftRef.current;
    if (!saved) {
      return;
    }
    if (saved.segments.length > 0) {
      mentionRef.current?.restoreFromSegments(saved.segments);
      latestSegmentsRef.current = saved.segments;
    }
    if (saved.attachments.length > 0) {
      attachments.restore(saved.attachments);
    }
    clearDraftContent(props.project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount restore
  }, []);

  // A pending selection from "New thread in worktree" targets an existing
  // worktree (carries worktreePath). Apply it to the branch selection and
  // clear the "New worktree" checkbox so submit reuses that worktree instead
  // of falling through to generating a fresh one. Subscribing to the store
  // (rather than relying on the mount-time lazy init above) covers the case
  // where this composer is already mounted for the project, so openDraft does
  // not remount it and the lazy init never re-runs.
  const projectId = props.project.id;
  const onWorktreeModeChange = props.onWorktreeModeChange;
  useEffect(() => {
    if (!pendingWorktreeSelection) return;
    setBranchSelection(pendingWorktreeSelection);
    onWorktreeModeChange(!pendingWorktreeSelection.worktreePath);
    useAppStore.getState().clearPendingDraftWorktreeSelection(projectId);
  }, [pendingWorktreeSelection, projectId, onWorktreeModeChange]);

  // A composer seed (e.g. "New thread from a to-do / selected note text") inserts
  // its text into the input at the caret, preserving anything the user already
  // typed. Subscribing to the store covers both a fresh mount and an
  // already-open draft (where openDraft does not remount this component).
  useEffect(() => {
    if (!pendingComposerSeed) return;
    mentionRef.current?.insertText(pendingComposerSeed.text);
    useAppStore.getState().clearComposerSeed(projectId);
  }, [pendingComposerSeed, projectId]);

  useEffect(() => {
    const pid = props.project.id;
    return () => {
      if (submittedRef.current) return;
      if (useAppStore.getState().consumeDraftContentDiscard(pid)) return;
      const content = { segments: latestSegmentsRef.current, attachments: attachmentsRef.current };
      if (isDraftContentNonEmpty(content)) {
        saveDraftContent(pid, content);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup-only effect keyed on project
  }, [props.project.id, saveDraftContent]);

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
    setSlashQuery(null);
    setSlashActiveIndex(0);
  }, [props.project.id, props.selectedAgent.kind]);

  return (
    <>
      <ThreadComposer
        autoFocus={(props.paneCount ?? 1) === 1 && !isRemote} // eslint-disable-line jsx-a11y/no-autofocus -- desktop only; mobile PWA skips it so navigating to a thread doesn't pop the keyboard
        compact={props.compact ?? false}
        variant="draft"
        controls={controls}
        toolbarLayoutKey={toolbarLayoutKey}
        fixedContent={
          <>
            {authRequired ? (
              <ThreadAuthRequiredDock agentStatus={props.selectedAgent} project={props.project} />
            ) : null}
            {!isRemote ? (
              <>
                <ThreadAgentUpdateDock
                  agentStatus={props.selectedAgent}
                  onUpdatingChange={setAgentUpdating}
                />
                <HookInstallProposal
                  project={props.project}
                  selectedAgent={props.selectedAgent}
                  presentationMode={props.presentationMode}
                />
              </>
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
            leading={
              mentionedMcpServers.length > 0 || showComputerUseChip ? (
                <>
                  {mentionedMcpServers.map((descriptor) => (
                    <McpChip
                      key={descriptor.id}
                      descriptor={descriptor}
                      onRemove={() =>
                        props.onConfigChange(mcpTogglePatch(descriptor.configKey, false))
                      }
                    />
                  ))}
                  {showComputerUseChip ? (
                    <ComputerUseChip
                      onRemove={() => props.onConfigChange({ computerUse: false })}
                    />
                  ) : null}
                </>
              ) : undefined
            }
          />
        }
        inputContent={
          <MentionInput
            ref={mentionRef}
            autoFocus={(props.paneCount ?? 1) === 1 && !isRemote} // eslint-disable-line jsx-a11y/no-autofocus -- desktop only; mobile PWA skips it so navigating to a thread doesn't pop the keyboard
            compact={props.compact ?? false}
            // The PWA surfaces this draft as the home screen's compact composer
            // pill, where an invitation reads better than the generic prompt.
            placeholder={
              props.placeholder ?? (isRemote ? t`Plan, ask, build…` : t`Send a message...`)
            }
            projectLocation={isHomeScope ? undefined : props.project.location}
            {...(!isHomeScope ? { projectId: props.project.id } : {})}
            onTextChange={(hasText) => {
              setHasContent(hasText);
              const segments = mentionRef.current?.serializeSegments() ?? [];
              latestSegmentsRef.current = segments;
            }}
            mcpMentions={mcpMentions}
            onMcpMentionSelect={onMcpMentionSelect}
            {...(!isRemote
              ? {
                  onPasteImage: (file: File) => {
                    void attachments.addClipboardImage(file, `draft:${props.project.id}`);
                  },
                }
              : {})}
            onSubmit={(segments) => {
              submitSegments([...attachments.toSegments(), ...segments]);
            }}
            onInterceptKey={(e) => {
              if (
                handleComposerControlShortcut(e, {
                  controls,
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
              if (!showCommandPanel) {
                return false;
              }
              return handleSlashCommandPanelKeyDown(e, {
                slashQuery,
                filteredCommands,
                slashActiveIndex,
                setSlashActiveIndex,
                setSlashQuery,
                mentionRef,
              });
            }}
            onSlashCommandChange={setSlashQuery}
          />
        }
        placeholder={props.placeholder ?? t`Send a message...`}
        prompt={prompt}
        submitDisabled={
          authRequired ||
          agentUpdating ||
          isSubmitting ||
          !(hasContent || attachments.attachments.length > 0)
        }
        submitPending={isSubmitting}
        submitLabel={t`Launch thread`}
        onPromptChange={setPrompt}
        {...(!isRemote ? { onAttachFiles: attachments.addFiles } : {})}
        onSubmit={() => {
          const segments = mentionRef.current?.serializeSegments() ?? [];
          submitSegments([...attachments.toSegments(), ...segments], prompt);
        }}
        afterControls={
          <DraftComposerAfterControls
            mcpServers={mcpServers}
            isRemote={isRemote}
            onPickFiles={() => {
              void (props.pickFiles ? props.pickFiles() : readBridge().pickFiles()).then(
                (paths) => {
                  if (paths) attachments.addFiles(paths);
                },
              );
            }}
            showVoiceInputButton={showVoiceInputButton}
            isDisabled={authRequired || agentUpdating || isSubmitting}
            mentionRef={mentionRef}
            voiceInputRef={voiceInputRef}
            computerUse={{
              enabled: computerUsePersistent,
              visible: computerUseScope !== "none",
              onToggle: (next) => setMcpServerEnabled(COMPUTER_USE_MCP_ID, next),
            }}
          />
        }
      />
      {props.gitBranch ? (
        <div data-draft-worktree-row="" className="mt-1.5 flex flex-wrap items-center gap-1 px-1">
          <WorktreeModeSelect
            mode={worktreeMode}
            canBringChanges={canBringChanges}
            onChange={handleWorktreeModeChange}
            compact
          />
          <BranchSelector
            projectId={props.project.id}
            currentBranch={props.gitBranch}
            value={branchSelection?.branch ?? props.gitBranch}
            isWorktree={branchSelection?.isWorktree}
            baseBranch={branchSelection?.baseBranch}
            worktreeMode={props.worktreeMode}
            onWorktreeModeChange={props.onWorktreeModeChange}
            onSelect={setBranchSelection}
            onSwitchBranch={props.onSwitchBranch}
            hideWorktreeToggle
            hideTriggerIcon
            compact
            showMoveBranchAction
            {...(props.project.scripts?.worktreeCopyPatterns
              ? {
                  moveBranchCopyIgnoredPatterns: props.project.scripts.worktreeCopyPatterns,
                }
              : {})}
          />
        </div>
      ) : null}
    </>
  );
}
