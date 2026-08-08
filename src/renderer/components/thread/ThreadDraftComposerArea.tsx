import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { toast } from "@heroui/react";
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
import { MAX_EXPERIMENT_CANDIDATES } from "@/shared/contracts";
import { hasSelectableReasoning } from "@/shared/agentSelection";
import { hookEnvForProject, hookEnvKey } from "@/shared/agentHookPluginEnv";
import { mergeMcpServers } from "@/shared/contracts/mcpServer";
import { isHomeProjectId } from "@/shared/homeScope";
import { skillSegmentFromSlashCommand } from "@/shared/promptContent";
import { friendlyError } from "@/shared/messages";
import { isQuickComposerWindow, isRemoteSession, readBridge } from "@/renderer/bridge";
import {
  AttachmentBar,
  ComputerUseChip,
  McpChip,
} from "@/renderer/components/composer/AttachmentBar";
import {
  ComposerAddMenu,
  type ComposerCustomMcpItem,
  type ComposerMcpMenuItem,
} from "@/renderer/components/composer/ComposerAddMenu";
import { ComposerVoiceInput } from "@/renderer/components/composer/ComposerVoiceInput";
import {
  composerMcpServers,
  COMPUTER_USE_MCP_ID,
  mcpTogglePatch,
  providerOwnsMcpConfig,
} from "@/renderer/components/composer/composerMcpServers";
import { openAttachmentLightbox } from "@/renderer/components/composer/ImageLightbox";
import { openPdfPreview } from "@/renderer/components/pdf/openPdfPreview";
import {
  MentionInput,
  type McpMentionItem,
  type MentionInputHandle,
} from "@/renderer/components/composer/MentionInput";
import {
  useAttachments,
  type SaveClipboardImage,
} from "@/renderer/components/composer/useAttachments";
import type { VoiceInputHandle } from "@/renderer/components/composer/VoiceInputButton";
import { getComputerUseScope } from "@/renderer/components/composer/computerUseScope";
import { useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import { flattenSegments } from "@/renderer/components/composer/serializeMentions";
import {
  BranchSelector,
  generateWorktreeBranch,
  type BranchSelection,
} from "@/renderer/components/common/BranchSelector/BranchSelector";
import { Button } from "@/renderer/components/common/Button";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { resolveModelLabel } from "@/renderer/components/providers/modelDisplay";
import { launchExperiment } from "@/renderer/actions/experimentActions";
import { updateProjectMcpServers } from "@/renderer/actions/projectActions";
import {
  ExperimentDraftTargets,
  type ExperimentDraftCandidate,
} from "@/renderer/components/experiment/ExperimentDraftTargets";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isDraftContentNonEmpty } from "@/renderer/state/slices/types";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import {
  usePluginMentionItems,
  useSkillSlashCommandState,
} from "@/renderer/components/skills/useSkills";
import { ThreadAgentUpdateDock } from "./ThreadAgentUpdateDock";
import { RemoteHostUpdateDock } from "./RemoteHostUpdateDock";
import { ThreadAuthRequiredDock } from "./ThreadAuthRequiredDock";
import { ThreadDockHeader, ThreadDockIconButton, ThreadDockSection } from "./ThreadDockUI";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import {
  bindLeadingSkillUnlessLocalAction,
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  rebindSkillSegments,
  resolveAvailableSlashCommands,
  resolveLocalActionUnlessSkill,
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
      !window.poracode?.getAgentHookPluginStatuses
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
            <ThreadDockIconButton
              label={t`Don't show hook install proposal`}
              tooltip={t`Dismiss`}
              danger
              onPress={() => dismissHookInstallProposal(proposalKey)}
            >
              <X className="size-3.5" />
            </ThreadDockIconButton>
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
  customMcpServers: readonly ComposerCustomMcpItem[];
  onPickFiles: () => void;
  showVoiceInputButton: boolean;
  isDisabled: boolean;
  experiment?: {
    enabled: boolean;
    disabled: boolean;
    onToggle: (next: boolean) => void;
  };
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
        customMcpServers={props.customMcpServers}
        showFileOption
        onPickFiles={props.onPickFiles}
        computerUse={props.computerUse}
        {...(props.experiment ? { experiment: props.experiment } : {})}
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
  isRemote?: boolean;
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
  /** Restores the selection replaced by a one-shot worktree target when this token changes. */
  restoreWorktreeSelectionToken?: number;
  /** Override whether unmodified Enter submits instead of inserting a newline. */
  submitOnEnter?: boolean;
  pickFiles?: () => Promise<string[] | null>;
  saveClipboardImage?: SaveClipboardImage;
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
  const [experimentMode, setExperimentMode] = useState(false);
  const [experimentCandidates, setExperimentCandidates] = useState<ExperimentDraftCandidate[]>([]);
  const [experimentBaseBranch, setExperimentBaseBranch] = useState<string | null>(null);
  const isRemoteSurface = isRemoteSession();
  const usesRemoteTransport = props.isRemote === true || isRemoteSurface;
  const isQuickComposer = window.poracode ? isQuickComposerWindow() : false;
  const showVoiceInputButton =
    useSharedSettings((s) => s.audio.showVoiceInputButton) && !isRemoteSurface;
  // Persistent (standing-default) composer MCP enablement, keyed by MCP id.
  const persistentMcpServers = useSharedSettings((s) => s.enabledMcpServers);
  const disabledBuiltInMcpServers = useSharedSettings((s) => s.disabledBuiltInMcpServers);
  const setMcpServerEnabled = useSharedSettings((s) => s.setMcpServerEnabled);
  const userCustomMcpServers = useSharedSettings((s) => s.mcpServers);
  const setUserCustomMcpServers = useSharedSettings((s) => s.setMcpServers);
  const mentionRef = useRef<MentionInputHandle>(null);
  const voiceInputRef = useRef<VoiceInputHandle>(null);
  const attachments = useAttachments({
    ...(props.saveClipboardImage ? { saveClipboardImage: props.saveClipboardImage } : {}),
  });
  // Remote-project attachments are stored on the paired desktop; resolve
  // previews through its image endpoint instead of the local-file protocol.
  const remoteDesktopId = props.project.remoteServerId;
  const attachmentImageUrlForPath = remoteDesktopId
    ? (path: string) => useRemoteServersStore.getState().localImageUrl(remoteDesktopId, path)
    : undefined;
  const inboxKey = props.paneId ?? `draft:${props.project.id}`;
  const fallbackInboxKey = `draft:${props.project.id}`;
  const pendingPickedAttachments = useBrowserAttachInbox((s) =>
    inboxKey ? s.itemsByThread[inboxKey] : undefined,
  );
  const pendingComposerInputs = useComposerInputInbox((s) => s.itemsByComposer[inboxKey]);
  const pendingFallbackComposerInputs = useComposerInputInbox((s) =>
    inboxKey === fallbackInboxKey ? undefined : s.itemsByComposer[fallbackInboxKey],
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
  const initialPendingWorktreeSelection =
    useAppStore.getState().pendingDraftWorktreeSelections[props.project.id] ?? null;
  const [branchSelection, setBranchSelection] = useState<BranchSelection | null>(
    initialPendingWorktreeSelection,
  );
  const worktreeSelectionRestoreRef = useRef<{
    branchSelection: BranchSelection | null;
    worktreeMode: boolean;
  } | null>(
    initialPendingWorktreeSelection
      ? { branchSelection: null, worktreeMode: props.worktreeMode }
      : null,
  );
  const previousRestoreTokenRef = useRef(props.restoreWorktreeSelectionToken);
  const pendingWorktreeSelection = useAppStore(
    (s) => s.pendingDraftWorktreeSelections[props.project.id],
  );
  const pendingComposerSeed = useAppStore((s) => s.pendingComposerSeeds[props.project.id]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const commandListId = useId();
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
  const { commands: skillCommands, resolved: skillCommandsResolved } = useSkillSlashCommandState(
    props.project.location,
    props.selectedAgent.kind,
    props.presentationMode,
  );
  const pluginMentions = usePluginMentionItems(
    props.project.location,
    props.selectedAgent.kind,
    props.presentationMode,
  );
  const slashLookupContext = {
    agentKind: props.selectedAgent.kind,
    presentationMode: props.presentationMode,
    runtimeLabel: props.selectedAgent.capabilities.runtimeLabel,
  };
  const availableCommands = resolveAvailableSlashCommands(
    undefined,
    props.selectedAgent.capabilities.slashCommands,
    {
      ...slashLookupContext,
      hasEffort: hasSelectableReasoning(props.selectedAgent.capabilities, props.config.model),
      supportsFast: supportsUsableFastMode(props.selectedAgent.capabilities, props.config.model),
      skillCommands,
      disabledSkillNames: props.selectedAgent.capabilities.disabledSkillNames,
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
  const availableComposerMcpServers = composerMcpServers.filter(
    (descriptor) => disabledBuiltInMcpServers[descriptor.id] !== true,
  );
  const mcpServers = availableComposerMcpServers.map((descriptor) => ({
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
  // User-configured MCP servers (global + this project's workspace scope).
  // Toggling flips the server's persistent `enabled` flag — the same switch as
  // the MCP Servers settings page — because custom servers bind at launch from
  // settings, not from per-thread config. The launch-time merge helper decides
  // which workspace entries override global ones, so the menu can't drift from
  // what actually launches. Providers whose MCP set lives on their settings
  // page show no rows here at all.
  const hideCustomMcpRows = providerOwnsMcpConfig(props.selectedAgent.capabilities);
  const projectCustomMcpServers = props.project.mcpServers ?? [];
  const projectCustomMcpIds = new Set(projectCustomMcpServers.map((server) => server.id));
  const mergedCustomMcpServers = hideCustomMcpRows
    ? []
    : mergeMcpServers(userCustomMcpServers, projectCustomMcpServers);
  const customMcpServers: ComposerCustomMcpItem[] = mergedCustomMcpServers.map((server) => {
    const isProject = projectCustomMcpIds.has(server.id);
    const scopedServers = isProject ? projectCustomMcpServers : userCustomMcpServers;
    return {
      id: `${isProject ? "project" : "user"}:${server.id}`,
      name: server.name,
      enabled: server.enabled,
      onToggle: (next: boolean) => {
        const nextServers = scopedServers.map((item) =>
          item.id === server.id ? { ...item, enabled: next } : item,
        );
        if (isProject) updateProjectMcpServers(props.project.id, nextServers);
        else setUserCustomMcpServers(nextServers);
      },
    };
  });
  // Composer chips represent per-thread *mentions* only: a server whose config
  // flag is on for this draft but that isn't persistently enabled. Persistently
  // enabled servers are on for every thread and show no chip.
  const mentionedMcpServers = availableComposerMcpServers.filter(
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

  const computerUseScope =
    disabledBuiltInMcpServers[COMPUTER_USE_MCP_ID] === true
      ? "none"
      : getComputerUseScope(
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
    ...availableComposerMcpServers
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
    const descriptor = availableComposerMcpServers.find((server) => server.id === id);
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
    experimentMode ? "experiment" : "thread",
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
    if (experimentMode) {
      void runExperiment(allSegments, fallbackPrompt);
      return;
    }
    const boundSegments = bindLeadingSkillUnlessLocalAction(
      allSegments,
      availableCommands,
      slashLookupContext,
    );
    const currentSegments = rebindSkillSegments(
      boundSegments,
      availableCommands,
      (name) => t`Use the ${name} skill.`,
    );
    const flatPrompt = flattenSegments(currentSegments) || fallbackPrompt.trim();
    if (flatPrompt.length === 0) {
      return;
    }
    const localAction = resolveLocalActionUnlessSkill(
      currentSegments,
      flatPrompt,
      slashLookupContext,
    );
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
      ...(currentSegments.length > 0 ? { segments: currentSegments } : {}),
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

  function resolveExperimentInput(allSegments: PromptSegment[], fallbackPrompt = "") {
    const boundSegments = bindLeadingSkillUnlessLocalAction(
      allSegments,
      availableCommands,
      slashLookupContext,
    );
    const segments = rebindSkillSegments(
      boundSegments,
      availableCommands,
      (name) => t`Use the ${name} skill.`,
    );
    const experimentPrompt = flattenSegments(segments) || fallbackPrompt.trim();
    return experimentPrompt ? { prompt: experimentPrompt, segments } : null;
  }

  function addExperimentCandidate() {
    if (authRequired || isSubmitting || experimentCandidates.length >= MAX_EXPERIMENT_CANDIDATES) {
      return;
    }
    const modelLabel = resolveModelLabel(props.selectedAgent, props.config.model) ?? "";
    setExperimentCandidates((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        agentKind: props.selectedAgent.kind,
        agentLabel: props.selectedAgent.label,
        ...(props.selectedAgent.icon ? { icon: props.selectedAgent.icon } : {}),
        config: { ...props.config },
        presentationMode: props.presentationMode,
        modelLabel,
      },
    ]);
  }

  async function runExperiment(allSegments: PromptSegment[], fallbackPrompt = "") {
    const input = resolveExperimentInput(allSegments, fallbackPrompt);
    const baseBranch = experimentBaseBranch ?? props.gitBranch;
    if (!input || !baseBranch || experimentCandidates.length < 2 || isSubmitting) return;
    setIsSubmitting(true);
    const experimentId = await launchExperiment({
      projectId: props.project.id,
      baseBranch,
      prompt: input.prompt,
      segments: input.segments,
      candidates: experimentCandidates.map(
        ({ id: _id, icon: _icon, modelLabel: _modelLabel, ...candidate }) => candidate,
      ),
    });
    if (experimentId) {
      submittedRef.current = true;
      clearDraftContent(props.project.id);
      return;
    }
    setIsSubmitting(false);
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
    worktreeSelectionRestoreRef.current ??= {
      branchSelection,
      worktreeMode: props.worktreeMode,
    };
    setBranchSelection(pendingWorktreeSelection);
    onWorktreeModeChange(!pendingWorktreeSelection.worktreePath);
    useAppStore.getState().clearPendingDraftWorktreeSelection(projectId);
  }, [
    pendingWorktreeSelection,
    projectId,
    onWorktreeModeChange,
    branchSelection,
    props.worktreeMode,
  ]);

  // The mobile inline composer stays mounted when it collapses. Restore the
  // selection that the context-menu worktree target temporarily replaced, so
  // reopening behaves like dismissing and reopening Electron's draft composer.
  const restoreWorktreeSelectionToken = props.restoreWorktreeSelectionToken;
  useEffect(() => {
    if (
      restoreWorktreeSelectionToken === undefined ||
      restoreWorktreeSelectionToken === previousRestoreTokenRef.current
    ) {
      return;
    }
    previousRestoreTokenRef.current = restoreWorktreeSelectionToken;
    const previousSelection = worktreeSelectionRestoreRef.current;
    if (!previousSelection) return;
    worktreeSelectionRestoreRef.current = null;
    setBranchSelection(previousSelection.branchSelection);
    onWorktreeModeChange(previousSelection.worktreeMode);
  }, [restoreWorktreeSelectionToken, onWorktreeModeChange]);

  // A composer seed (e.g. "New thread from a to-do / selected note text") inserts
  // its text into the input at the caret, preserving anything the user already
  // typed. Subscribing to the store covers both a fresh mount and an
  // already-open draft (where openDraft does not remount this component).
  useEffect(() => {
    if (!pendingComposerSeed) return;
    if (pendingComposerSeed.bindLeadingSkill) {
      const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(pendingComposerSeed.text);
      const command = match
        ? skillCommands.find((candidate) => candidate.id === match[1])
        : undefined;
      if (!skillCommandsResolved) return;
      if (command) {
        const skill = skillSegmentFromSlashCommand(command);
        if (skill) {
          mentionRef.current?.insertSegments([
            skill,
            ...(match?.[2] ? [{ kind: "text" as const, content: ` ${match[2]}` }] : []),
          ]);
        }
        useAppStore.getState().clearComposerSeed(projectId);
        return;
      }
    }
    mentionRef.current?.insertText(pendingComposerSeed.text);
    useAppStore.getState().clearComposerSeed(projectId);
  }, [pendingComposerSeed, projectId, skillCommands, skillCommandsResolved]);

  useEffect(() => {
    const composer = mentionRef.current;
    if (
      isSubmitting ||
      !composer ||
      (!pendingComposerInputs?.length && !pendingFallbackComposerInputs?.length)
    ) {
      return;
    }
    const keys = inboxKey === fallbackInboxKey ? [inboxKey] : [fallbackInboxKey, inboxKey];
    let composerHasContent = composer.serializeSegments().length > 0;
    for (const key of keys) {
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
    fallbackInboxKey,
    inboxKey,
    isSubmitting,
    pendingComposerInputs,
    pendingFallbackComposerInputs,
  ]);

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
        autoFocus={(props.paneCount ?? 1) === 1 && !isRemoteSurface} // eslint-disable-line jsx-a11y/no-autofocus -- desktop only; mobile PWA skips it so navigating to a thread doesn't pop the keyboard
        compact={props.compact ?? false}
        variant="draft"
        controls={controls}
        toolbarLayoutKey={toolbarLayoutKey}
        fixedContent={
          <>
            {props.project.remoteServerId ? (
              <RemoteHostUpdateDock desktopId={props.project.remoteServerId} />
            ) : null}
            {authRequired ? (
              <ThreadAuthRequiredDock agentStatus={props.selectedAgent} project={props.project} />
            ) : null}
            {!usesRemoteTransport ? (
              <>
                <ThreadAgentUpdateDock
                  agentStatus={props.selectedAgent}
                  project={props.project}
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
                listId={commandListId}
                onActiveIndexChange={setSlashActiveIndex}
                onSelect={(cmd) => {
                  mentionRef.current?.insertSlashCommand(cmd);
                  setSlashQuery(null);
                }}
              />
            ) : null}
            {experimentMode && props.gitBranch ? (
              <ExperimentDraftTargets
                candidates={experimentCandidates}
                isSubmitting={isSubmitting}
                isAddDisabled={
                  authRequired ||
                  agentUpdating ||
                  isSubmitting ||
                  experimentCandidates.length >= MAX_EXPERIMENT_CANDIDATES
                }
                onRemove={(id) =>
                  setExperimentCandidates((current) =>
                    current.filter((candidate) => candidate.id !== id),
                  )
                }
                onCancel={() => {
                  setExperimentMode(false);
                  setExperimentCandidates([]);
                  setExperimentBaseBranch(null);
                }}
                onAdd={addExperimentCandidate}
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
              if (idx >= 0)
                openAttachmentLightbox(imageAttachments, idx, attachmentImageUrlForPath);
            }}
            onPreviewPdf={(att) => openPdfPreview(att.path)}
            {...(attachmentImageUrlForPath ? { imageUrlForPath: attachmentImageUrlForPath } : {})}
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
            autoFocus={(props.paneCount ?? 1) === 1 && !isRemoteSurface} // eslint-disable-line jsx-a11y/no-autofocus -- desktop only; mobile PWA skips it so navigating to a thread doesn't pop the keyboard
            compact={props.compact ?? false}
            // The PWA surfaces this draft as the home screen's compact composer
            // pill, where an invitation reads better than the generic prompt.
            placeholder={
              props.placeholder ?? (isRemoteSurface ? t`Plan, ask, build…` : t`Send a message...`)
            }
            projectLocation={isHomeScope ? undefined : props.project.location}
            submitOnEnter={props.submitOnEnter ?? !isRemoteSurface}
            {...(showCommandPanel
              ? {
                  commandListId,
                  commandActiveDescendant: `${commandListId}-option-${slashActiveIndex}`,
                }
              : {})}
            {...(!isHomeScope ? { projectId: props.project.id } : {})}
            onTextChange={(hasText) => {
              setHasContent(hasText);
              const segments = mentionRef.current?.serializeSegments() ?? [];
              latestSegmentsRef.current = segments;
            }}
            mcpMentions={mcpMentions}
            pluginMentions={pluginMentions}
            onMcpMentionSelect={onMcpMentionSelect}
            onPasteImage={(file: File) => {
              void attachments
                .addClipboardImage(file, `draft:${props.project.id}`)
                .catch((error: unknown) => toast.danger(friendlyError(error)));
            }}
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
          !(hasContent || attachments.attachments.length > 0) ||
          (experimentMode && experimentCandidates.length < 2)
        }
        submitPending={isSubmitting}
        submitLabel={experimentMode ? t`Run experiment` : t`Launch thread`}
        onPromptChange={setPrompt}
        {...(!usesRemoteTransport ? { onAttachFiles: attachments.addFiles } : {})}
        onSubmit={() => {
          const segments = mentionRef.current?.serializeSegments() ?? [];
          submitSegments([...attachments.toSegments(), ...segments], prompt);
        }}
        afterControls={
          <DraftComposerAfterControls
            mcpServers={mcpServers}
            onPickFiles={() => {
              void (
                props.pickFiles
                  ? props.pickFiles()
                  : readBridge().pickFiles({ attachmentThreadId: `draft:${props.project.id}` })
              )
                .then((paths) => {
                  if (paths) attachments.addFiles(paths);
                })
                .catch((error: unknown) => toast.danger(friendlyError(error)));
            }}
            customMcpServers={customMcpServers}
            showVoiceInputButton={showVoiceInputButton}
            isDisabled={authRequired || agentUpdating || isSubmitting}
            {...(!isHomeScope && !usesRemoteTransport && !isQuickComposer && props.gitBranch
              ? {
                  experiment: {
                    enabled: experimentMode,
                    disabled: authRequired || agentUpdating || isSubmitting,
                    onToggle: (next: boolean) => {
                      setExperimentMode(next);
                      if (next) {
                        setExperimentBaseBranch(
                          branchSelection?.baseBranch ??
                            branchSelection?.branch ??
                            props.gitBranch ??
                            null,
                        );
                      } else {
                        setExperimentCandidates([]);
                        setExperimentBaseBranch(null);
                      }
                    },
                  },
                }
              : {})}
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
            mode={experimentMode ? "new" : worktreeMode}
            canBringChanges={experimentMode ? false : canBringChanges}
            onChange={handleWorktreeModeChange}
            isDisabled={experimentMode}
            compact
          />
          <BranchSelector
            projectId={props.project.id}
            currentBranch={props.gitBranch}
            value={
              experimentMode
                ? (experimentBaseBranch ?? props.gitBranch)
                : (branchSelection?.branch ?? props.gitBranch)
            }
            isWorktree={experimentMode ? true : branchSelection?.isWorktree}
            baseBranch={
              experimentMode
                ? (experimentBaseBranch ?? props.gitBranch)
                : branchSelection?.baseBranch
            }
            worktreeMode={experimentMode || props.worktreeMode}
            {...(!experimentMode ? { onWorktreeModeChange: props.onWorktreeModeChange } : {})}
            onSelect={
              experimentMode
                ? (selection) => setExperimentBaseBranch(selection.baseBranch ?? selection.branch)
                : setBranchSelection
            }
            onSwitchBranch={props.onSwitchBranch}
            hideWorktreeToggle
            hideTriggerIcon
            compact
            showMoveBranchAction={!experimentMode}
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
