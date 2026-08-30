import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentCapability,
  AgentStatus,
  ExtractContextResult,
  ProjectDraftConfig,
  ProjectLocation,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { Button } from "@/renderer/components/common/Button";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { readBridge } from "@/renderer/bridge";
import type { ComposerControl } from "./ThreadComposer";
import { ThreadComposer } from "./ThreadComposer";
import {
  appendProviderComposerControls,
  buildModelPickerControls,
  buildProviderModelMenuProviders,
} from "./buildModelPickerControls";
import { AttachmentBar } from "../composer/AttachmentBar";
import { openAttachmentLightbox } from "../composer/ImageLightbox";
import { openPdfPreview } from "../pdf/openPdfPreview";
import { MentionInput, type MentionInputHandle } from "../composer/MentionInput";
import { useAttachments } from "../composer/useAttachments";
import { flattenSegments } from "../composer/serializeMentions";
import { PresentationModeTabs } from "./PresentationModeTabs";
import {
  agentStatusForPresentation,
  capabilitiesForPresentation,
  filterHiddenModels,
  resolveModelSelection,
  resolveReasoningSelection,
} from "@/shared/agentSelection";
import { crossagentRankingPreferences } from "@/shared/crossagentRanking";
import type { RankedCrossagentCandidate } from "@/shared/crossagentRanking";
import {
  continuesInPlace,
  rankContinueProviders,
  resolveInitialPresentationMode,
  supportsPresentation,
} from "@/shared/continueProviderRanking";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildTranscriptContext } from "@/renderer/actions/handoffTranscript";
import { DEFAULT_HANDOFF_PROMPT } from "@/renderer/actions/providerHandoff";

type Phase = "select" | "extracting" | "error";
type PendingSubmission = { prompt: string; segments?: PromptSegment[] };
/**
 * `fork` opens a second thread beside the original; `switch` continues the same
 * task in the target provider — in place for a chat target, as a replacement
 * thread when the target is a terminal.
 */
export type ContinueIntent = "fork" | "switch";

/** The model/reasoning/Fast values the ranked provider is normally launched with. */
function preferredConfigPatch(
  ranked: RankedCrossagentCandidate | undefined,
): Partial<ThreadConfig> {
  const selection = ranked?.preferredSelection;
  if (!selection?.model) return {};
  return {
    model: selection.model,
    ...(selection.effort ? { effort: selection.effort } : {}),
    ...(selection.fast ? { fast: true } : {}),
  };
}

function resolveContextSizeValue(
  capabilities: AgentCapability,
  model: string,
  preferred?: string,
): string | undefined {
  const allowed = capabilities.modelContextSizes?.[model];
  if (!allowed?.length) return capabilities.defaultContextSize;
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0];
}

function resolveModeValue(
  capabilities: AgentCapability,
  preferred?: ThreadConfig["mode"],
): ThreadConfig["mode"] | undefined {
  return preferred && capabilities.modes.includes(preferred)
    ? preferred
    : (capabilities.modes[0] ?? undefined);
}

function resolveLabeledOptionValue(
  options: ReadonlyArray<{ id: string }>,
  preferred: string | undefined,
  bypass: string | undefined,
): string {
  if (preferred !== undefined) {
    return options.some((o) => o.id === preferred) ? preferred : "";
  }
  if (bypass && options.some((o) => o.id === bypass)) {
    return bypass;
  }
  return options[0]?.id ?? "";
}

function resolveDefaultConfig(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
  preferred?: Partial<ThreadConfig>,
): ThreadConfig {
  const capabilities = capabilitiesForPresentation(agent.capabilities, presentationMode);
  const model = resolveModelSelection(capabilities, preferred?.model);
  const effort = resolveReasoningSelection(capabilities, model, preferred?.effort);
  const contextSize = resolveContextSizeValue(capabilities, model, preferred?.contextSize);
  const fast = supportsUsableFastMode(capabilities, model) ? preferred?.fast === true : false;
  const thinking = capabilities.thinkingModels?.includes(model)
    ? preferred?.thinking === true
    : false;
  const mode = resolveModeValue(capabilities, preferred?.mode);
  const approvalPolicy = resolveLabeledOptionValue(
    capabilities.approvalPolicies,
    preferred?.approvalPolicy,
    capabilities.bypassPermissions?.approvalPolicy,
  );
  const sandboxMode = resolveLabeledOptionValue(
    capabilities.sandboxModes,
    preferred?.sandboxMode,
    capabilities.bypassPermissions?.sandboxMode,
  );

  return {
    model,
    ...(effort ? { effort } : {}),
    ...(contextSize ? { contextSize } : {}),
    ...(fast ? { fast } : {}),
    ...(thinking ? { thinking } : {}),
    ...(mode ? { mode } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
    ...(preferred?.approvalsReviewer ? { approvalsReviewer: preferred.approvalsReviewer } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
  };
}

function savedConfigForAgent(agent: AgentStatus, savedConfig?: ProjectDraftConfig) {
  return savedConfig?.agentKind === agent.kind ? savedConfig : undefined;
}

export function ContinueInProviderDialog(props: {
  isOpen: boolean;
  thread: Thread;
  projectLocation: ProjectLocation;
  installedAgents: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  /** Thread-owner-aware file picker; remote panes pass one that uploads to the host. */
  pickFiles?: (() => Promise<string[] | null>) | undefined;
  onClose: () => void;
  onContinue: (
    targetAgentKind: string,
    targetConfig: ThreadConfig,
    targetPresentationMode: ThreadPresentationMode,
    prompt: string,
    segments: PromptSegment[] | undefined,
    intent: ContinueIntent,
    extractedContext: ExtractContextResult | null,
  ) => void;
}) {
  const { thread, installedAgents, onClose, onContinue } = props;
  const { t } = useLingui();

  const lastPresentationModeByAgent = useSharedSettings((s) => s.lastPresentationModeByAgent);
  const setLastPresentationMode = useSharedSettings((s) => s.setLastPresentationMode);
  const agentSelectionUsage = useSharedSettings((s) => s.agentSelectionUsage);
  const crossagentSelectionUsage = useSharedSettings((s) => s.crossagentSelectionUsage);
  const crossagentRoutingOverrides = useSharedSettings((s) => s.crossagentRoutingOverrides);
  const favoriteModels = useSharedSettings((s) => s.favoriteModels);

  const otherAgents = installedAgents.filter((a) => a.kind !== thread.agentKind);
  const sourceAgent = installedAgents.find((a) => a.kind === thread.agentKind);
  const sourcePresentationMode =
    thread.presentationMode ?? sourceAgent?.capabilities.presentationMode ?? "terminal";

  // Propose the provider the user actually reaches for most; `proposedRanking`
  // feeds `preferredConfigPatch` below so the proposal carries the model the
  // selection normally launches with.
  const rankedTargets = rankContinueProviders(
    otherAgents,
    lastPresentationModeByAgent,
    sourcePresentationMode,
    crossagentRankingPreferences({
      agentSelectionUsage,
      crossagentSelectionUsage,
      crossagentRoutingOverrides,
      favoriteModels,
    }),
  );
  const proposedAgent =
    otherAgents.find((a) => a.kind === rankedTargets[0]?.provider) ?? otherAgents[0];
  const proposedRanking = rankedTargets.find((entry) => entry.provider === proposedAgent?.kind);
  const proposedPresentationMode = resolveInitialPresentationMode(
    proposedAgent,
    lastPresentationModeByAgent,
    sourcePresentationMode,
  );

  const [selectedKind, setSelectedKind] = useState<string>(proposedAgent?.kind ?? "");
  const [phase, setPhase] = useState<Phase>("select");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingIntent, setPendingIntent] = useState<ContinueIntent>("fork");
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const mentionRef = useRef<MentionInputHandle>(null);
  const attachments = useAttachments();

  const selectedAgent = otherAgents.find((a) => a.kind === selectedKind);
  const sourceRuntimeStatus = sourceAgent
    ? agentStatusForPresentation(sourceAgent, sourcePresentationMode, thread.sessionRef)
    : undefined;
  const [targetPresentationMode, setTargetPresentationMode] =
    useState<ThreadPresentationMode>(proposedPresentationMode);

  // --- Target provider config ---
  const [targetConfig, setTargetConfig] = useState<ThreadConfig>(() =>
    proposedAgent
      ? resolveDefaultConfig(proposedAgent, proposedPresentationMode, {
          ...savedConfigForAgent(proposedAgent, props.lastDraftConfig),
          ...preferredConfigPatch(proposedRanking),
        })
      : { model: "" },
  );

  function handleProviderChange(kind: string, preferred?: Partial<ThreadConfig>) {
    setSelectedKind(kind);
    const agent = otherAgents.find((a) => a.kind === kind);
    if (agent) {
      const nextPresentationMode = supportsPresentation(agent, targetPresentationMode)
        ? targetPresentationMode
        : resolveInitialPresentationMode(
            agent,
            lastPresentationModeByAgent,
            sourcePresentationMode,
          );
      if (nextPresentationMode !== targetPresentationMode) {
        setTargetPresentationMode(nextPresentationMode);
      }
      setTargetConfig(
        resolveDefaultConfig(agent, nextPresentationMode, {
          ...savedConfigForAgent(agent, props.lastDraftConfig),
          ...preferred,
        }),
      );
    }
  }

  function handlePresentationModeChange(next: ThreadPresentationMode) {
    const nextAgent =
      selectedAgent && supportsPresentation(selectedAgent, next)
        ? selectedAgent
        : otherAgents.find((agent) => supportsPresentation(agent, next));
    if (!nextAgent) return;

    setTargetPresentationMode(next);
    setLastPresentationMode(nextAgent.kind, next);
    if (nextAgent.kind !== selectedKind) setSelectedKind(nextAgent.kind);
    setTargetConfig(
      resolveDefaultConfig(
        nextAgent,
        next,
        nextAgent.kind === selectedKind ? targetConfig : undefined,
      ),
    );
  }

  function handleTargetConfigPatch(patch: Partial<ThreadConfig>) {
    if (!selectedAgent) return;
    setTargetConfig((prev) =>
      resolveDefaultConfig(selectedAgent, targetPresentationMode, { ...prev, ...patch }),
    );
  }

  const allHiddenModels = useSharedSettings((s) => s.hiddenModels);
  const selectedTargetCapabilities = selectedAgent
    ? filterHiddenModels(
        capabilitiesForPresentation(selectedAgent.capabilities, targetPresentationMode),
        allHiddenModels[modelVisibilityKey(selectedAgent.kind, targetPresentationMode)],
      )
    : undefined;
  const providerModelProviders = buildProviderModelMenuProviders(otherAgents, {
    presentationMode: targetPresentationMode,
    hiddenModelsByAgent: allHiddenModels,
    filterAgent: (agent) => supportsPresentation(agent, targetPresentationMode),
  });
  const targetControls: ComposerControl[] = selectedAgent
    ? appendProviderComposerControls(
        buildModelPickerControls({
          providers: providerModelProviders,
          selectedAgentKind: selectedKind,
          model: targetConfig.model,
          ...(targetConfig.effort ? { effort: targetConfig.effort } : {}),
          ...(targetConfig.contextSize ? { contextSize: targetConfig.contextSize } : {}),
          ...(targetConfig.fast ? { fast: targetConfig.fast } : {}),
          ...(targetConfig.thinking ? { thinking: targetConfig.thinking } : {}),
          capabilities: selectedTargetCapabilities ?? selectedAgent.capabilities,
          presentationMode: targetPresentationMode,
          onProviderModelChange: (next) =>
            handleProviderChange(next.agentKind, { model: next.model }),
          onConfigPatch: handleTargetConfigPatch,
        }),
        {
          agentKind: selectedKind,
          capabilities: selectedTargetCapabilities ?? selectedAgent.capabilities,
          config: targetConfig,
          presentationMode: targetPresentationMode,
          isDisabled: false,
          onConfigChange: handleTargetConfigPatch,
        },
      )
    : [];
  const supportsTargetTerminalMode = otherAgents.some((agent) =>
    supportsPresentation(agent, "terminal"),
  );
  const supportsTargetGuiMode = otherAgents.some((agent) => supportsPresentation(agent, "gui"));

  // --- Extraction config (source provider) ---
  const hiddenModelIds = useSharedSettings(
    (s) => s.hiddenModels[modelVisibilityKey(thread.agentKind, sourcePresentationMode)],
  );
  const filteredSourceCaps = sourceRuntimeStatus
    ? filterHiddenModels(sourceRuntimeStatus.capabilities, hiddenModelIds)
    : undefined;
  const models = filteredSourceCaps?.models ?? [];
  const extractModel = thread.config.model || models[0]?.id || "";
  const extractEffort = thread.config.effort ?? "";
  const extractionEfforts =
    filteredSourceCaps?.modelEfforts?.[extractModel] ?? filteredSourceCaps?.efforts ?? [];
  const effectiveExtractEffort = extractionEfforts.includes(extractEffort)
    ? extractEffort
    : filteredSourceCaps?.defaultEffort &&
        extractionEfforts.includes(filteredSourceCaps.defaultEffort)
      ? filteredSourceCaps.defaultEffort
      : (extractionEfforts[0] ?? "");
  function buildSubmission(inputSegments?: PromptSegment[]): PendingSubmission | null {
    const composerSegments = inputSegments ?? mentionRef.current?.serializeSegments() ?? [];
    const allSegments = [...attachments.toSegments(), ...composerSegments];
    const flatPrompt = flattenSegments(allSegments);
    if (!flatPrompt.trim()) {
      return { prompt: DEFAULT_HANDOFF_PROMPT };
    }
    return {
      prompt: flatPrompt,
      ...(allSegments.length > 0 ? { segments: allSegments } : {}),
    };
  }

  async function handleAction(intent: ContinueIntent, inputSegments?: PromptSegment[]) {
    const submission = buildSubmission(inputSegments);
    if (!submission) return;
    setPendingIntent(intent);
    setPendingSubmission(submission);
    setLastPresentationMode(selectedKind, targetPresentationMode);

    if (!thread.sessionRef || thread.remoteServerId !== undefined) {
      // No session to extract from — or a mirrored thread, whose `extractContext`
      // is a host-side procedure this renderer deliberately does not route. The
      // stored transcript (hydrated from the host snapshot) is the context.
      const fallback = buildTranscriptContext(thread, sourceAgent?.label ?? thread.agentKind);
      onContinue(
        selectedKind,
        targetConfig,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        fallback,
      );
      return;
    }

    setPhase("extracting");
    try {
      const result = await readBridge().extractContext({
        threadId: thread.id,
        agentKind: thread.agentKind,
        sessionRef: thread.sessionRef,
        projectLocation: props.projectLocation,
        ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
        ...(extractModel ? { model: extractModel } : {}),
        ...(effectiveExtractEffort ? { effort: effectiveExtractEffort } : {}),
      });
      onContinue(
        selectedKind,
        targetConfig,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        result,
      );
    } catch (err) {
      const fallback = buildTranscriptContext(thread, sourceAgent?.label ?? thread.agentKind);
      if (fallback) {
        onContinue(
          selectedKind,
          targetConfig,
          targetPresentationMode,
          submission.prompt,
          submission.segments,
          intent,
          fallback,
        );
        return;
      }
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function handleCancel() {
    if (phase === "extracting") {
      readBridge()
        .cancelExtractContext({ threadId: thread.id })
        .catch(() => {});
    }
    setPhase("select");
    setErrorMessage("");
    onClose();
  }

  function handleStartWithoutContext() {
    const submission = pendingSubmission ?? buildSubmission();
    if (!submission) return;
    onContinue(
      selectedKind,
      targetConfig,
      targetPresentationMode,
      submission.prompt,
      submission.segments,
      pendingIntent,
      null,
    );
  }

  const canSubmit = Boolean(selectedKind && targetConfig.model);
  const targetProviderFallback = t`the target provider`;
  const switchOpensNewThread = !continuesInPlace(sourcePresentationMode, targetPresentationMode);

  return (
    <>
      <Modal.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[760px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                <Trans>Continue in another provider</Trans>
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="px-5 pb-5 pt-2">
              {phase === "select" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <PresentationModeTabs
                      presentationMode={targetPresentationMode}
                      supportsTerminal={supportsTargetTerminalMode}
                      supportsGui={supportsTargetGuiMode}
                      onChange={handlePresentationModeChange}
                    />
                    {switchOpensNewThread && (
                      <p className="text-center text-xs text-muted">
                        <Trans>
                          Switching starts a new thread with the same title, because the chat can
                          only continue in place between two chat providers.
                        </Trans>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <ThreadComposer
                      autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                      compact
                      variant="draft"
                      hideSubmitButton
                      controls={targetControls}
                      toolbarLayoutKey={[
                        selectedKind,
                        targetPresentationMode,
                        targetConfig.model,
                        targetConfig.effort ?? "",
                        targetConfig.contextSize ?? "",
                        targetConfig.fast ? "fast" : "normal",
                        targetConfig.thinking ? "thinking" : "standard",
                      ].join("|")}
                      attachmentBar={
                        <AttachmentBar
                          attachments={attachments.attachments}
                          onRemove={attachments.removeAttachment}
                          onPreviewImage={(att) => {
                            const imageAttachments = attachments.attachments.filter(
                              (a) => a.isImage,
                            );
                            const idx = imageAttachments.findIndex((a) => a.id === att.id);
                            if (idx >= 0) openAttachmentLightbox(imageAttachments, idx);
                          }}
                          onPreviewPdf={(att) => openPdfPreview(att.path)}
                        />
                      }
                      inputContent={
                        <MentionInput
                          ref={mentionRef}
                          autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                          compact
                          placeholder={t`Tell ${selectedAgent?.label ?? targetProviderFallback} what to do next...`}
                          projectLocation={props.projectLocation}
                          projectId={thread.projectId}
                          onTextChange={() => undefined}
                          onPasteImage={(file) => {
                            void attachments.addClipboardImage(file, `handoff:${thread.id}`);
                          }}
                          onSubmit={(segments) => {
                            void handleAction("fork", segments);
                          }}
                        />
                      }
                      placeholder={t`Tell the target provider what to do next...`}
                      prompt=""
                      submitDisabled={!canSubmit}
                      submitLabel={t`Fork`}
                      onPromptChange={() => undefined}
                      onSubmit={() => {
                        void handleAction("fork");
                      }}
                      afterControls={
                        <Button
                          isIconOnly
                          aria-label={t`Attach files`}
                          className="poracode-composer-menu min-w-9 px-2"
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            void (
                              props.pickFiles ? props.pickFiles() : readBridge().pickFiles()
                            ).then((paths) => {
                              if (paths) attachments.addFiles(paths);
                            });
                          }}
                        >
                          <Paperclip className="size-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              )}

              {phase === "extracting" && (
                <div className="flex items-center gap-3 py-2">
                  <PixelLoader size="sm" />
                  <p className="text-sm text-muted">
                    <Trans>
                      Extracting context from {sourceAgent?.label ?? thread.agentKind}...
                    </Trans>
                  </p>
                </div>
              )}

              {phase === "error" && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm">
                    <Trans>Could not extract context.</Trans>
                  </p>
                  {errorMessage && (
                    <p className="max-h-20 overflow-y-auto text-xs text-muted">{errorMessage}</p>
                  )}
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              {phase === "select" && (
                <>
                  <Button slot="close" variant="ghost" className="text-muted">
                    <Trans>Cancel</Trans>
                  </Button>
                  <Button
                    variant="secondary"
                    isDisabled={!canSubmit}
                    onPress={() => {
                      void handleAction("fork");
                    }}
                  >
                    <Trans>Fork</Trans>
                  </Button>
                  <Button
                    variant="tertiary"
                    isDisabled={!canSubmit}
                    onPress={() => {
                      void handleAction("switch");
                    }}
                  >
                    <Trans>Switch</Trans>
                  </Button>
                </>
              )}
              {phase === "extracting" && (
                <Button variant="ghost" className="text-muted" onPress={handleCancel}>
                  <Trans>Cancel</Trans>
                </Button>
              )}
              {phase === "error" && (
                <>
                  <Button variant="ghost" className="text-muted" onPress={handleCancel}>
                    <Trans>Cancel</Trans>
                  </Button>
                  <Button variant="secondary" onPress={handleStartWithoutContext}>
                    <Trans>Start Without Context</Trans>
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
