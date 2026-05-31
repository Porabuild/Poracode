import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tooltip, toast } from "@heroui/react";
import { Download, Webhook, X } from "lucide-react";
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
import { readBridge } from "@/renderer/bridge";
import {
  AttachmentBar,
  BrowserChip,
  ComposerAddMenu,
  ImageLightbox,
  MentionInput,
  VoiceInputButton,
  type MentionInputHandle,
  useAttachments,
} from "@/renderer/components/composer";
import { getBrowserMcpScope } from "@/renderer/components/composer/browserMcpScope";
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
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import { ThreadAgentUpdateDock } from "./ThreadAgentUpdateDock";
import { ThreadAuthRequiredDock } from "./ThreadAuthRequiredDock";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";
import {
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
} from "./threadSlashCommands";
import { handleComposerControlShortcut } from "./threadComposerShortcuts";

export type DraftStartInput = {
  agentKind: AgentStatus["kind"];
  config: ThreadConfig;
  prompt: string;
  segments?: PromptSegment[];
  existingWorktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseBranch?: string;
  worktreeIsNewBranch?: boolean;
  presentationMode?: ThreadPresentationMode;
};

function HookInstallProposal(props: {
  project: Project;
  selectedAgent: AgentStatus;
  presentationMode: ThreadPresentationMode;
}) {
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
        toast.success(`${props.selectedAgent.label} hooks installed.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error
            ? error.message
            : `Unable to install ${props.selectedAgent.label} hooks.`,
        ),
      )
      .finally(() => setPending(false));
  };

  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel="Install CLI hooks">
      <ThreadDockHeader
        icon={Webhook}
        iconClassName="text-foreground"
        title="Install CLI hooks"
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
              Install
            </Button>
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <button
                  aria-label="Don't show hook install proposal"
                  className="shrink-0 rounded p-1 text-muted/70 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
                  type="button"
                  onClick={() => dismissHookInstallProposal(proposalKey)}
                >
                  <X className="size-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content>Dismiss</Tooltip.Content>
            </Tooltip>
          </div>
        }
      >
        <span className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]">
          Better status updates while agents run.
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
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
  onConfigChange: (patch: Partial<ThreadConfig>) => void;
  onWorktreeModeChange: (worktreeMode: boolean) => void;
  onSwitchBranch: (branch: string, createNew: boolean) => void;
  onRememberPresentationMode: () => void;
  onStart: (input: DraftStartInput) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  // Set to true while an agent-binary update is running for this project's env.
  // Locks the composer Send so the user can't fire a thread mid-upgrade — the
  // launched agent would race with the still-running install and could pick up
  // either binary, which is a confusing state to debug.
  const [agentUpdating, setAgentUpdating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const showVoiceInputButton = useSharedSettings((s) => s.audio.showVoiceInputButton);
  const mentionRef = useRef<MentionInputHandle>(null);
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [branchSelection, setBranchSelection] = useState<BranchSelection | null>(
    () => useAppStore.getState().pendingDraftWorktreeSelections[props.project.id] ?? null,
  );
  const pendingWorktreeSelection = useAppStore(
    (s) => s.pendingDraftWorktreeSelections[props.project.id],
  );
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [controlOpenRequest, setControlOpenRequest] = useState<{
    target: "model" | "effort";
    nonce: number;
  } | null>(null);
  const imageAttachments = attachments.attachments.filter((a) => a.isImage);
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
      supportsFast:
        props.selectedAgent.capabilities.fastModels?.includes(props.config.model) ?? false,
    },
  );
  const filteredCommands = filterSlashCommands(availableCommands, slashQuery);
  const showCommandPanel = filteredCommands.length > 0;
  const authRequired = props.selectedAgent.authState === "missing";
  const isHomeScope = isHomeProjectId(props.project.id);
  const browserMcpScope = getBrowserMcpScope(props.selectedAgent.kind, props.presentationMode);
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
    controlKinds,
  ].join("|");
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
      if (props.selectedAgent.capabilities.fastModels?.includes(props.config.model)) {
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
    props.onStart({
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
            }
        : {}),
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

  useEffect(() => {
    const pid = props.project.id;
    return () => {
      if (submittedRef.current) return;
      const segments = latestSegmentsRef.current;
      const atts = attachmentsRef.current;
      if (segments.length > 0 || atts.length > 0) {
        saveDraftContent(pid, { segments, attachments: atts });
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
        autoFocus={(props.paneCount ?? 1) === 1} // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
        compact={props.compact ?? false}
        variant="draft"
        controls={controls}
        toolbarLayoutKey={toolbarLayoutKey}
        fixedContent={
          <>
            {authRequired ? (
              <ThreadAuthRequiredDock agentStatus={props.selectedAgent} project={props.project} />
            ) : null}
            <ThreadAgentUpdateDock
              agentStatus={props.selectedAgent}
              onUpdatingChange={setAgentUpdating}
            />
            <HookInstallProposal
              project={props.project}
              selectedAgent={props.selectedAgent}
              presentationMode={props.presentationMode}
            />
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
              const idx = imageAttachments.findIndex((a) => a.id === att.id);
              if (idx >= 0) setLightboxIndex(idx);
            }}
            leading={
              props.config.browserMcp === true ? (
                <BrowserChip onRemove={() => props.onConfigChange({ browserMcp: false })} />
              ) : undefined
            }
          />
        }
        inputContent={
          <MentionInput
            ref={mentionRef}
            autoFocus={(props.paneCount ?? 1) === 1} // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
            compact={props.compact ?? false}
            placeholder="Send a message..."
            projectLocation={isHomeScope ? undefined : props.project.location}
            {...(!isHomeScope ? { projectId: props.project.id } : {})}
            onTextChange={(hasText) => {
              setHasContent(hasText);
              const segments = mentionRef.current?.serializeSegments() ?? [];
              latestSegmentsRef.current = segments;
            }}
            showBrowserMention={browserMcpScope !== "none" && props.config.browserMcp !== true}
            onBrowserMentionSelect={() => props.onConfigChange({ browserMcp: true })}
            onPasteImage={(file) => {
              void attachments.addClipboardImage(file, `draft:${props.project.id}`);
            }}
            onSubmit={(segments) => {
              submitSegments([...attachments.toSegments(), ...segments]);
            }}
            onInterceptKey={(e) => {
              if (
                handleComposerControlShortcut(e, {
                  controls,
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
        placeholder="Send a message..."
        prompt={prompt}
        submitDisabled={
          authRequired ||
          agentUpdating ||
          isSubmitting ||
          !(hasContent || attachments.attachments.length > 0)
        }
        submitPending={isSubmitting}
        submitLabel="Launch thread"
        onPromptChange={setPrompt}
        onAttachFiles={attachments.addFiles}
        onSubmit={() => {
          const segments = mentionRef.current?.serializeSegments() ?? [];
          submitSegments([...attachments.toSegments(), ...segments], prompt);
        }}
        afterControls={(level) => (
          <>
            <ComposerAddMenu
              browserMcpEnabled={props.config.browserMcp === true}
              showBrowserOption={browserMcpScope !== "none"}
              onPickFiles={() => {
                void readBridge()
                  .pickFiles()
                  .then((paths) => {
                    if (paths) attachments.addFiles(paths);
                  });
              }}
              onToggleBrowserMcp={(next) => props.onConfigChange({ browserMcp: next })}
            />
            {props.gitBranch ? (
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
                forceHideLabel={level >= 3}
                iconOnly={level >= 3}
              />
            ) : null}
            {showVoiceInputButton ? (
              <VoiceInputButton
                isDisabled={authRequired || agentUpdating || isSubmitting}
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
            ) : null}
          </>
        )}
      />
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
