import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Paperclip, TerminalSquare, X } from "lucide-react";
import { Button, Spinner, toast, Tooltip } from "@heroui/react";
import { useShallow } from "zustand/shallow";
import type {
  AgentStatus,
  Project,
  ProjectDraftConfig,
  PromptSegment,
  ThreadConfig,
} from "../../../shared/contracts";
import { readBridge } from "../../bridge";
import { ProviderIcon, getComposerControls } from "../providers";
import { useGitStore } from "../../state/gitStore";
import { BranchSelector, generateWorktreeBranch, type BranchSelection } from "../common";
import {
  MentionInput,
  type MentionInputHandle,
  AttachmentBar,
  ImageLightbox,
  useAttachments,
} from "../composer";
import { flattenSegments } from "../composer/serializeMentions";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { useAppStore } from "../../state/appStore";
import { filterHiddenModels } from "./threadComposerOptions";
import { friendlyError } from "../../../shared/messages";
import { ThreadComposer } from "./ThreadComposer";

function resolvePreferredAgentKind(
  installedAgents: AgentStatus[],
  lastDraftConfig?: ProjectDraftConfig,
): AgentStatus["kind"] | undefined {
  if (lastDraftConfig) {
    const savedAgent = installedAgents.find((agent) => agent.kind === lastDraftConfig.agentKind);
    if (savedAgent) {
      return savedAgent.kind;
    }
  }

  return installedAgents[0]?.kind;
}

function resolveModelValue(agent: AgentStatus, preferred?: string): string {
  const models = agent.capabilities.models;
  return preferred && models.some((m) => m.id === preferred) ? preferred : (models[0]?.id ?? "");
}

function resolveEffortValue(agent: AgentStatus, model: string, preferred?: string): string {
  const efforts = agent.capabilities.modelEfforts?.[model] ?? agent.capabilities.efforts ?? [];
  if (preferred && efforts.includes(preferred)) {
    return preferred;
  }

  const fallback = agent.capabilities.defaultEffort;
  if (fallback && efforts.includes(fallback)) {
    return fallback;
  }

  return efforts[0] ?? "";
}

function resolveModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.modes;
  return preferred && modes.includes(preferred as "agent" | "plan" | "autopilot")
    ? preferred
    : (modes[0] ?? "agent");
}

function normalizeOptionName(value: string): string {
  return value.trim().toLowerCase();
}

function findDefaultApprovalPolicy(agent: AgentStatus): string | undefined {
  const policies = agent.capabilities.approvalPolicies;
  const configuredBypass = agent.capabilities.bypassApprovalPolicy;
  if (configuredBypass && policies.some((policy) => policy.id === configuredBypass)) {
    return configuredBypass;
  }

  const preferredIds = new Set(["never", "yolo", "bypassPermissions", "dontAsk"]);
  const byId = policies.find((policy) => preferredIds.has(policy.id));
  if (byId) {
    return byId.id;
  }

  const preferredLabels = new Set([
    "full access",
    "yolo",
    "bypass permissions",
    "don't ask",
    "dont ask",
  ]);
  const byLabel = policies.find((policy) => preferredLabels.has(normalizeOptionName(policy.label)));
  return byLabel?.id;
}

function resolveApprovalPolicyValue(agent: AgentStatus, preferred?: string): string {
  const policies = agent.capabilities.approvalPolicies;
  return preferred && policies.some((p) => p.id === preferred)
    ? preferred
    : (findDefaultApprovalPolicy(agent) ?? policies[0]?.id ?? "");
}

function findDefaultSandboxMode(agent: AgentStatus): string | undefined {
  const modes = agent.capabilities.sandboxModes;
  const preferredIds = new Set(["danger-full-access", "full-access"]);
  const byId = modes.find((mode) => preferredIds.has(mode.id));
  if (byId) {
    return byId.id;
  }

  const byLabel = modes.find((mode) => normalizeOptionName(mode.label) === "full access");
  return byLabel?.id;
}

function resolveSandboxModeValue(agent: AgentStatus, preferred?: string): string {
  const modes = agent.capabilities.sandboxModes;
  return preferred && modes.some((m) => m.id === preferred)
    ? preferred
    : (findDefaultSandboxMode(agent) ?? modes[0]?.id ?? "");
}

function formatAgentList(names: string[]): string {
  if (names.length === 0) return "a supported coding agent";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

export function ThreadDraftView(props: {
  project: Project;
  agentStatuses: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  compact?: boolean;
  paneAlign?: "left" | "center" | "right";
  showCloseButton?: boolean;
  isDragging?: boolean;
  dropIndicator?: false | "replace" | "insert-left" | "insert-right";
  paneIndex?: number;
  paneCount?: number;
  droppableRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: () => void;
  dragHandleRef?: React.RefCallback<Element>;
  onStart: (input: {
    agentKind: AgentStatus["kind"];
    config: ThreadConfig;
    prompt: string;
    segments?: PromptSegment[];
    existingWorktreePath?: string;
    worktreeBranch?: string;
    worktreeBaseBranch?: string;
    worktreeIsNewBranch?: boolean;
  }) => void;
}) {
  const { project, agentStatuses, lastDraftConfig, onStart } = props;
  const { gitBranch, gitHasRemote, gitHasTracking, gitAhead, gitBehind } = useGitStore(
    useShallow((s) => {
      const gitStatus = s.statuses[project.id];
      return {
        gitBranch: gitStatus?.branch,
        gitHasRemote: gitStatus?.hasRemote ?? false,
        gitHasTracking: Boolean(gitStatus?.tracking),
        gitAhead: gitStatus?.ahead ?? 0,
        gitBehind: gitStatus?.behind ?? 0,
      };
    }),
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const installedAgents = agentStatuses.filter((status) => status.installed);
  const preferredAgentKind = resolvePreferredAgentKind(installedAgents, lastDraftConfig);
  const [agentKind, setAgentKind] = useState<AgentStatus["kind"] | undefined>(preferredAgentKind);
  const effectiveAgentKind = installedAgents.some((status) => status.kind === agentKind)
    ? agentKind
    : preferredAgentKind;
  const selectedAgent =
    installedAgents.find((status) => status.kind === effectiveAgentKind) ?? installedAgents[0];
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [mode, setMode] = useState<"agent" | "plan" | "autopilot">("agent");
  const [approvalPolicy, setApprovalPolicy] = useState("");
  const [sandboxMode, setSandboxMode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [hasContent, setHasContent] = useState(false);
  const mentionRef = useRef<MentionInputHandle>(null);
  const attachments = useAttachments();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const imageAttachments = attachments.attachments.filter((a) => a.isImage);
  const [worktreeMode, setWorktreeMode] = useState(lastDraftConfig?.worktreeMode ?? false);
  const [branchSelection, setBranchSelection] = useState<BranchSelection | null>(null);
  const lastAppliedAgentKindRef = useRef<AgentStatus["kind"] | undefined>(undefined);

  // --- Draft preservation: save on unmount, restore on mount ---
  const saveDraftContent = useAppStore((s) => s.saveDraftContent);
  const clearDraftContent = useAppStore((s) => s.clearDraftContent);

  // Refs capture the latest values so the unmount cleanup can read
  // them after the contentEditable DOM has been torn down.
  const latestSegmentsRef = useRef<PromptSegment[]>([]);
  const attachmentsRef = useRef(attachments.attachments);
  attachmentsRef.current = attachments.attachments;

  function resetDraftRefs() {
    latestSegmentsRef.current = [];
    attachmentsRef.current = [];
  }

  function handleSwitchBranch(branch: string, createNew: boolean) {
    readBridge()
      .gitSwitchBranch({
        projectLocation: project.location,
        branch,
        createNew,
      })
      .then((result) => {
        // Immediately patch the store so the UI updates without waiting
        // for the file-watcher → refreshProject cascade.
        const store = useGitStore.getState();
        const status = store.statuses[project.id];
        if (status) {
          store.setStatus(project.id, {
            ...status,
            branch: result.branch,
            tracking: result.tracking,
            ahead: result.ahead,
            behind: result.behind,
          });
        }
        store.setBranches(project.id, result.branches);
      })
      .catch((err: unknown) => {
        console.error("[git] switch branch failed", err);
        toast.danger(friendlyError(err));
      });
  }

  const initialDraftRef = useRef(useAppStore.getState().draftContents[project.id]);

  useLayoutEffect(() => {
    const saved = initialDraftRef.current;
    if (!saved) return;
    if (saved.segments.length > 0) {
      mentionRef.current?.restoreFromSegments(saved.segments);
      latestSegmentsRef.current = saved.segments;
    }
    if (saved.attachments.length > 0) {
      attachments.restore(saved.attachments);
    }
    clearDraftContent(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount restore
  }, []);

  // Save draft content + config when the component unmounts.
  useEffect(() => {
    const pid = project.id;
    return () => {
      const segments = latestSegmentsRef.current;
      const atts = attachmentsRef.current;
      if (segments.length > 0 || atts.length > 0) {
        saveDraftContent(pid, { segments, attachments: atts });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup-only effect keyed on project
  }, [project.id, saveDraftContent]);

  useEffect(() => {
    if (effectiveAgentKind && agentKind !== effectiveAgentKind) {
      setAgentKind(effectiveAgentKind);
    }
  }, [agentKind, effectiveAgentKind]);

  useEffect(() => {
    if (!selectedAgent || !effectiveAgentKind) {
      return;
    }

    if (lastAppliedAgentKindRef.current === effectiveAgentKind) {
      return;
    }

    const restoreSavedDraft =
      lastAppliedAgentKindRef.current === undefined &&
      lastDraftConfig?.agentKind === effectiveAgentKind;
    const nextModel = resolveModelValue(
      selectedAgent,
      restoreSavedDraft ? lastDraftConfig?.model : undefined,
    );

    setModel(nextModel);
    setEffort(
      resolveEffortValue(
        selectedAgent,
        nextModel,
        restoreSavedDraft ? lastDraftConfig?.effort : undefined,
      ),
    );
    setMode(
      resolveModeValue(selectedAgent, restoreSavedDraft ? lastDraftConfig?.mode : undefined) as
        | "agent"
        | "plan"
        | "autopilot",
    );
    setApprovalPolicy(
      resolveApprovalPolicyValue(
        selectedAgent,
        restoreSavedDraft ? lastDraftConfig?.approvalPolicy : undefined,
      ),
    );
    setSandboxMode(
      resolveSandboxModeValue(
        selectedAgent,
        restoreSavedDraft ? lastDraftConfig?.sandboxMode : undefined,
      ),
    );
    lastAppliedAgentKindRef.current = effectiveAgentKind;
  }, [effectiveAgentKind, lastDraftConfig, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }

    const nextEffort = resolveEffortValue(selectedAgent, model, effort);
    if (nextEffort !== effort) {
      setEffort(nextEffort);
    }
  }, [effort, model, selectedAgent]);

  const hiddenModelIds = useSharedSettings((s) =>
    selectedAgent ? s.hiddenModels[selectedAgent.kind] : undefined,
  );

  if (!selectedAgent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No supported agents detected</h1>
        <p className="text-muted">
          Install {formatAgentList(props.agentStatuses.map((s) => s.label))} to create a thread.
        </p>
      </div>
    );
  }

  const factory = getComposerControls(selectedAgent.kind);
  const onConfigPatch = (patch: Partial<ThreadConfig>) => {
    if (patch.model !== undefined) setModel(patch.model);
    if (patch.effort !== undefined) setEffort(patch.effort);
    if (patch.mode !== undefined) setMode(patch.mode as "agent" | "plan" | "autopilot");
    if (patch.approvalPolicy !== undefined) setApprovalPolicy(patch.approvalPolicy);
    if (patch.sandboxMode !== undefined) setSandboxMode(patch.sandboxMode);
  };

  const alignClass =
    props.paneAlign === "right" ? "ml-auto" : props.paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass = "px-2";

  return (
    <div
      ref={props.droppableRef}
      className={`relative flex h-full min-h-0 flex-col ${props.isDragging ? "opacity-50" : ""}`}
    >
      {props.compact && (
        <div className={`${paddingClass} px-4`}>
          <div
            ref={props.dragHandleRef}
            className={`${alignClass} flex w-full max-w-[920px] items-center gap-2 py-1.5 ${props.dragHandleRef ? "cursor-grab active:cursor-grabbing" : ""}`}
          >
            <TerminalSquare className="size-3.5 shrink-0 text-muted/60" />
            <span className="flex-1 truncate text-sm font-medium text-muted">
              New thread — {project.name}
            </span>
            {props.showCloseButton && props.onClose && (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted/60 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose?.();
                }}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className={`${props.compact ? alignClass : "mx-auto"} relative flex h-full min-h-0 w-full max-w-[1040px] flex-col ${paddingClass} px-4 ${props.compact ? "pb-4" : "py-8"}`}
      >
        {props.dropIndicator === "replace" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
          />
        )}
        {props.dropIndicator === "insert-left" && props.paneIndex === 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 -left-1 z-20 w-0.5 rounded-full bg-accent"
          />
        )}
        {props.dropIndicator === "insert-right" &&
          (props.paneIndex === undefined ||
            props.paneIndex === (props.paneCount ?? 1) - 1) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 -right-1 z-20 w-0.5 rounded-full bg-accent"
            />
          )}
          {/* Center area — logo */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="w-full max-w-[920px] overflow-visible pb-[0.32em] text-center">
              <h1 className={`inline-flex items-baseline gap-3 leading-[1.22] font-semibold tracking-[-0.06em] ${props.compact ? "text-[clamp(1.75rem,5vw,3rem)]" : "text-[clamp(3.25rem,8vw,6.25rem)]"}`}>
                <span className="pr-[0.04em] pb-[0.04em] text-transparent [background-image:linear-gradient(135deg,var(--foreground)_0%,color-mix(in_oklab,var(--accent)_60%,var(--foreground))_52%,var(--muted)_100%)] [background-size:100%_100%] bg-clip-text">
                  Lightcode
                </span>
                <TerminalSquare className="translate-y-[-0.04em] size-[0.48em] shrink-0 text-[color:color-mix(in_oklab,var(--accent)_58%,var(--foreground))] opacity-90" />
              </h1>
              <p className={`mx-auto mt-1 max-w-full truncate leading-snug font-medium tracking-tight text-transparent [background-image:linear-gradient(135deg,var(--muted)_0%,color-mix(in_oklab,var(--accent)_30%,var(--muted))_100%)] [background-size:100%_100%] bg-clip-text font-mono ${props.compact ? "text-[clamp(0.75rem,2vw,1.125rem)]" : "text-[clamp(1.25rem,3vw,2rem)]"}`}>
                {project.name}
              </p>
            </div>
          </div>

          {/* Composer at bottom */}
          <div className={`${props.compact ? alignClass : "mx-auto"} w-full max-w-[920px]`}>
              <ThreadComposer
                autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                compact={props.compact ?? false}
                controls={[
                  {
                    icon: (
                      <ProviderIcon
                        kind={selectedAgent.kind}
                        tone="inactive"
                        className="size-4 shrink-0"
                      />
                    ),
                    options: installedAgents.map((agent) => ({
                      id: agent.kind,
                      label: agent.label,
                      icon: (
                        <ProviderIcon
                          kind={agent.kind}
                          tone="inactive"
                          className="size-4 shrink-0"
                        />
                      ),
                    })),
                    value: selectedAgent.kind,
                    iconOnly: true,
                    onChange: (value) => setAgentKind(value as AgentStatus["kind"]),
                  },
                  ...(factory
                    ? factory({
                        capabilities: filterHiddenModels(
                          selectedAgent.capabilities,
                          hiddenModelIds,
                        ),
                        config: { model, effort, mode, approvalPolicy, sandboxMode },
                        isDisabled: false,
                        onConfigChange: onConfigPatch,
                      })
                    : []),
                ]}
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
                    autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                    compact={props.compact ?? false}
                    placeholder="Ask LightCode anything, @ to add files, / for commands"
                    projectLocation={project.location}
                    onTextChange={(hasText) => {
                      setHasContent(hasText);
                      latestSegmentsRef.current =
                        mentionRef.current?.serializeSegments() ?? [];
                    }}
                    onPasteImage={(file) => {
                      // Draft view uses project.id as threadId for temp storage
                      void attachments.addClipboardImage(file, `draft:${project.id}`);
                    }}
                    onSubmit={(segments) => {
                      const allSegments = [...attachments.toSegments(), ...segments];
                      const useWorktree = branchSelection?.isWorktree ?? worktreeMode;
                      resetDraftRefs();
                      onStart({
                        agentKind: selectedAgent.kind,
                        config: {
                          model,
                          ...(effort ? { effort } : {}),
                          ...(mode ? { mode } : {}),
                          ...(approvalPolicy ? { approvalPolicy } : {}),
                          ...(sandboxMode ? { sandboxMode } : {}),
                        },
                        prompt: flattenSegments(allSegments),
                        segments: allSegments,
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
                      attachments.clearAll();
                    }}
                  />
                }
                placeholder="Ask LightCode anything, @ to add files, / for commands"
                prompt={prompt}
                submitDisabled={!(hasContent || attachments.attachments.length > 0)}
                submitLabel="Launch thread"
                onPromptChange={setPrompt}
                onSubmit={() => {
                  const segments = mentionRef.current?.serializeSegments() ?? [];
                  const allSegments = [...attachments.toSegments(), ...segments];
                  const flatPrompt = flattenSegments(allSegments) || prompt.trim();
                  if (flatPrompt.length === 0) return;
                  // Clear refs so unmount effect won't re-save a stale draft.
                  latestSegmentsRef.current = [];
                  attachmentsRef.current = [];
                  const useWorktree = branchSelection?.isWorktree ?? worktreeMode;
                  onStart({
                    agentKind: selectedAgent.kind,
                    config: {
                      model,
                      ...(effort ? { effort } : {}),
                      ...(mode ? { mode } : {}),
                      ...(approvalPolicy ? { approvalPolicy } : {}),
                      ...(sandboxMode ? { sandboxMode } : {}),
                    },
                    prompt: flatPrompt,
                    ...(allSegments.length > 0 ? { segments: allSegments } : {}),
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
                  attachments.clearAll();
                }}
                afterControls={
                  <>
                    <Button
                      isIconOnly
                      aria-label="Attach files"
                      className="lightcode-composer-menu min-w-9 px-2"
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        void readBridge()
                          .pickFiles()
                          .then((paths) => {
                            if (paths) attachments.addFiles(paths);
                          });
                      }}
                    >
                      <Paperclip className="size-4" />
                    </Button>
                    {gitBranch ? (
                      <div className="flex items-center gap-0.5">
                        <BranchSelector
                          projectId={project.id}
                          currentBranch={gitBranch}
                          value={branchSelection?.branch ?? gitBranch}
                          isWorktree={branchSelection?.isWorktree}
                          baseBranch={branchSelection?.baseBranch}
                          worktreeMode={worktreeMode}
                          onWorktreeModeChange={setWorktreeMode}
                          onSelect={setBranchSelection}
                          onSwitchBranch={handleSwitchBranch}
                        />
                        {gitHasRemote && (
                          <Tooltip delay={0}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="lightcode-composer-menu min-w-9 px-2"
                              isDisabled={isSyncing}
                              isPending={isSyncing}
                              onPress={() => {
                                setIsSyncing(true);
                                const needsPush = gitHasTracking
                                  ? gitAhead > 0 && gitBehind === 0
                                  : true;
                                const op = needsPush
                                  ? readBridge().gitPush({
                                      projectLocation: project.location,
                                      setUpstream: !gitHasTracking,
                                    })
                                  : readBridge().gitSync({ projectLocation: project.location });
                                void op.finally(() => setIsSyncing(false));
                              }}
                            >
                              {({ isPending }) =>
                                isPending ? (
                                  <Spinner color="current" size="sm" />
                                ) : (
                                  <span className="text-sm">
                                    {gitHasTracking ? `${gitBehind}↓ ${gitAhead}↑` : "↑"}
                                  </span>
                                )
                              }
                            </Button>
                            <Tooltip.Content>
                              {!gitHasTracking
                                ? "Push"
                                : gitBehind > 0
                                  ? `Sync (↓${gitBehind}${gitAhead > 0 ? ` ↑${gitAhead}` : ""})`
                                  : gitAhead > 0
                                    ? `Push ↑${gitAhead}`
                                    : "Sync"}
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                      </div>
                    ) : null}
                  </>
                }
              />
            </div>
          </div>
      {lightboxIndex !== null && imageAttachments.length > 0 ? (
        <ImageLightbox
          images={imageAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
