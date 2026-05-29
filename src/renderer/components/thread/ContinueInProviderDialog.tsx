import { useRef, useState } from "react";
import { Paperclip, Zap } from "lucide-react";
import { Modal } from "@heroui/react";
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
import { Button, PixelLoader } from "@/renderer/components/common";
import { getComposerControls } from "@/renderer/components/providers";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import { readBridge } from "@/renderer/bridge";
import type { ComposerControl } from "./ThreadComposer";
import { ThreadComposer } from "./ThreadComposer";
import { AttachmentBar, ImageLightbox, MentionInput, useAttachments } from "../composer";
import type { MentionInputHandle } from "../composer";
import { flattenSegments } from "../composer/serializeMentions";
import { PresentationModeTabs } from "./PresentationModeTabs";
import { capabilitiesForPresentation, filterHiddenModels } from "./threadComposerOptions";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";

type Phase = "select" | "extracting" | "error";
type PendingSubmission = { prompt: string; segments?: PromptSegment[] };
const MAX_TRANSCRIPT_CONTEXT_CHARS = 50_000;
const DEFAULT_HANDOFF_PROMPT =
  "Continue from the transferred context and pick up where the previous provider left off.";

function formatEffortLabel(id: string): string {
  if (id === "xhigh" || id === "xHigh") return "Extra High";
  if (id === "ultracode") return "Ultracode";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function supportedPresentationModes(agent: AgentStatus): ThreadPresentationMode[] {
  return agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
}

function supportsPresentation(agent: AgentStatus, mode: ThreadPresentationMode): boolean {
  return supportedPresentationModes(agent).includes(mode);
}

function resolveInitialPresentationMode(
  agent: AgentStatus | undefined,
  lastByAgent: Record<string, ThreadPresentationMode>,
  sourceMode: ThreadPresentationMode,
): ThreadPresentationMode {
  if (!agent) return "terminal";
  const supported = supportedPresentationModes(agent);
  const last = lastByAgent[agent.kind];
  if (last && supported.includes(last)) return last;
  if (supported.includes(sourceMode)) return sourceMode;
  if (supported.includes("gui")) return "gui";
  return supported[0] ?? agent.capabilities.presentationMode ?? "terminal";
}

function resolveModelValue(capabilities: AgentCapability, preferred?: string): string {
  const models = capabilities.models;
  return preferred && models.some((m) => m.id === preferred) ? preferred : (models[0]?.id ?? "");
}

function resolveEffortValue(
  capabilities: AgentCapability,
  model: string,
  preferred?: string,
): string {
  const efforts = capabilities.modelEfforts?.[model] ?? capabilities.efforts ?? [];
  if (preferred && efforts.includes(preferred)) return preferred;
  if (capabilities.defaultEffort && efforts.includes(capabilities.defaultEffort)) {
    return capabilities.defaultEffort;
  }
  return efforts[0] ?? "";
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
  const model = resolveModelValue(capabilities, preferred?.model);
  const effort = resolveEffortValue(capabilities, model, preferred?.effort);
  const contextSize = resolveContextSizeValue(capabilities, model, preferred?.contextSize);
  const fast = capabilities.fastModels?.includes(model) ? preferred?.fast === true : false;
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
    ...(sandboxMode ? { sandboxMode } : {}),
  };
}

function savedConfigForAgent(agent: AgentStatus, savedConfig?: ProjectDraftConfig) {
  return savedConfig?.agentKind === agent.kind ? savedConfig : undefined;
}

function applyDefaultControlTiers(control: ComposerControl): ComposerControl {
  if (control.tier !== undefined) return control;
  if (control.kind === "toggle" && (control.label === "Plan" || control.label === "Work")) {
    return { ...control, tier: 2 };
  }
  if (
    (control.kind === undefined || control.kind === "toggle" || control.kind === "menu") &&
    control.iconKind === "permission"
  ) {
    return { ...control, tier: 1 };
  }
  return control;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function textFromContentBlocks(payload: unknown): string {
  const content = asRecord(payload)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const record = asRecord(block);
      if (!record) return "";
      if (record.kind === "text" && typeof record.text === "string") return record.text;
      if (record.kind === "file" && typeof record.path === "string") return `@${record.path}`;
      if (record.kind === "image") {
        if (typeof record.path === "string") return `@${record.path}`;
        if (typeof record.name === "string") return `[image: ${record.name}]`;
        return "[image]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function formatRuntimeItemForHandoff(item: RuntimeChatItem): string | null {
  const streams = item.streams;
  const payload = asRecord(item.payload);
  switch (item.type) {
    case "user_message": {
      const text = textFromContentBlocks(item.payload);
      return text ? `User:\n${text}` : null;
    }
    case "assistant_message": {
      const text = textFromContentBlocks(item.payload) || streams.assistant_text;
      return text ? `Assistant:\n${text}` : null;
    }
    case "plan": {
      const steps = payload?.steps;
      if (!Array.isArray(steps)) return null;
      const text = steps
        .map((step) => {
          const record = asRecord(step);
          if (!record || typeof record.step !== "string") return "";
          const status = typeof record.status === "string" ? record.status : "pending";
          return `- [${status}] ${record.step}`;
        })
        .filter(Boolean)
        .join("\n");
      return text ? `Plan:\n${text}` : null;
    }
    case "goal": {
      const objective = typeof payload?.objective === "string" ? payload.objective : "";
      const status = typeof payload?.status === "string" ? ` (${payload.status})` : "";
      return objective ? `Goal${status}:\n${objective}` : null;
    }
    case "tool_call":
    case "mcp_tool_call":
    case "image_view":
    case "dynamic_tool_call": {
      const name = typeof payload?.title === "string" ? payload.title : payload?.name;
      const status = typeof payload?.status === "string" ? payload.status : item.state;
      return typeof name === "string" ? `Tool ${status}: ${name}` : null;
    }
    case "command_execution": {
      const command = typeof payload?.command === "string" ? payload.command : "";
      const output = streams.command_output;
      return command || output
        ? `Command:\n${command}${output ? `\nOutput:\n${output}` : ""}`
        : null;
    }
    case "file_change": {
      const path = typeof payload?.path === "string" ? payload.path : "";
      const kind = typeof payload?.changeKind === "string" ? payload.changeKind : "change";
      return path ? `File ${kind}: ${path}` : null;
    }
    case "web_search": {
      const query = typeof payload?.query === "string" ? payload.query : "";
      return query ? `Web search: ${query}` : null;
    }
    case "error": {
      const message = typeof payload?.message === "string" ? payload.message : "";
      return message ? `Error:\n${message}` : null;
    }
    default:
      return null;
  }
}

export function ContinueInProviderDialog(props: {
  isOpen: boolean;
  thread: Thread;
  projectLocation: ProjectLocation;
  installedAgents: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  onClose: () => void;
  onContinue: (
    targetAgentKind: string,
    targetConfig: ThreadConfig,
    targetPresentationMode: ThreadPresentationMode,
    prompt: string,
    segments: PromptSegment[] | undefined,
    closeOriginal: boolean,
    extractedContext: ExtractContextResult | null,
  ) => void;
}) {
  const { thread, installedAgents, onClose, onContinue } = props;

  const otherAgents = installedAgents.filter((a) => a.kind !== thread.agentKind);
  const [selectedKind, setSelectedKind] = useState<string>(otherAgents[0]?.kind ?? "");
  const [phase, setPhase] = useState<Phase>("select");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingCloseOriginal, setPendingCloseOriginal] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const mentionRef = useRef<MentionInputHandle>(null);
  const attachments = useAttachments();
  const imageAttachments = attachments.attachments.filter((a) => a.isImage);

  const sourceAgent = installedAgents.find((a) => a.kind === thread.agentKind);
  const selectedAgent = otherAgents.find((a) => a.kind === selectedKind);
  const sourcePresentationMode =
    thread.presentationMode ?? sourceAgent?.capabilities.presentationMode ?? "terminal";
  const lastPresentationModeByAgent = useSharedSettings((s) => s.lastPresentationModeByAgent);
  const setLastPresentationMode = useSharedSettings((s) => s.setLastPresentationMode);
  const [targetPresentationMode, setTargetPresentationMode] = useState<ThreadPresentationMode>(() =>
    resolveInitialPresentationMode(
      selectedAgent,
      lastPresentationModeByAgent,
      sourcePresentationMode,
    ),
  );

  // --- Target provider config ---
  const [targetConfig, setTargetConfig] = useState<ThreadConfig>(() =>
    selectedAgent
      ? resolveDefaultConfig(
          selectedAgent,
          resolveInitialPresentationMode(
            selectedAgent,
            lastPresentationModeByAgent,
            sourcePresentationMode,
          ),
          savedConfigForAgent(selectedAgent, props.lastDraftConfig),
        )
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
        allHiddenModels[selectedAgent.kind],
      )
    : undefined;
  const providerModelProviders = otherAgents
    .filter((agent) => supportsPresentation(agent, targetPresentationMode))
    .map((agent) => ({
      kind: agent.kind,
      label: agent.label,
      capabilities: filterHiddenModels(
        capabilitiesForPresentation(agent.capabilities, targetPresentationMode),
        allHiddenModels[agent.kind],
      ),
    }));
  const targetEfforts = (
    selectedTargetCapabilities?.modelEfforts?.[targetConfig.model] ??
    selectedTargetCapabilities?.efforts ??
    []
  ).map((id) => ({ id, label: formatEffortLabel(id) }));
  const selectableTargetEfforts = targetEfforts.length > 1 ? targetEfforts : [];
  const targetContextIds = selectedTargetCapabilities?.modelContextSizes?.[targetConfig.model];
  const targetContextSizes =
    (targetContextIds
      ? selectedTargetCapabilities?.contextSizes?.filter((c) => targetContextIds.includes(c.id))
      : undefined) ?? [];
  const selectableTargetContextSizes = targetContextSizes.length > 1 ? targetContextSizes : [];
  const targetSupportsFast =
    selectedTargetCapabilities?.fastModels?.includes(targetConfig.model) ?? false;
  const targetSupportsThinking =
    selectedTargetCapabilities?.thinkingModels?.includes(targetConfig.model) ?? false;
  const targetControls: ComposerControl[] = selectedAgent
    ? [
        {
          kind: "provider-model",
          providers: providerModelProviders,
          currentAgentKind: selectedKind,
          currentModel: targetConfig.model,
          presentationMode: targetPresentationMode,
          hideLabelOnWrap: true,
          tier: 5,
          onChange: (next) => handleProviderChange(next.agentKind, { model: next.model }),
        },
        ...(selectableTargetEfforts.length > 0 ||
        selectableTargetContextSizes.length > 0 ||
        targetSupportsThinking
          ? [
              {
                kind: "effort-context" as const,
                efforts: selectableTargetEfforts,
                ...(selectableTargetEfforts.length > 0 && targetConfig.effort
                  ? { effortValue: targetConfig.effort }
                  : {}),
                onEffortChange: (value: string) => handleTargetConfigPatch({ effort: value }),
                contextSizes: selectableTargetContextSizes,
                ...(selectableTargetContextSizes.length > 0 && targetConfig.contextSize
                  ? { contextValue: targetConfig.contextSize }
                  : {}),
                onContextChange: (value: string) => handleTargetConfigPatch({ contextSize: value }),
                thinkingSupported: targetSupportsThinking,
                thinkingValue: targetConfig.thinking === true,
                onThinkingChange: (value: boolean) => handleTargetConfigPatch({ thinking: value }),
                hideLabelOnWrap: true,
                tier: 4,
                ...(selectableTargetEfforts.length > 0 && targetConfig.effort
                  ? {
                      icon: (
                        <EffortIcon
                          className="size-4 text-foreground"
                          effort={targetConfig.effort}
                          efforts={selectableTargetEfforts.map((e) => e.id)}
                        />
                      ),
                    }
                  : {}),
              },
            ]
          : []),
        ...(targetSupportsFast
          ? [
              {
                kind: "toggle" as const,
                label: "Fast",
                icon: <Zap className="size-3.5" />,
                iconOnly: true,
                fillIconOnSelect: true,
                isSelected: targetConfig.fast === true,
                onChange: (selected: boolean) => handleTargetConfigPatch({ fast: selected }),
                tier: 3,
              },
            ]
          : []),
        ...(
          getComposerControls(selectedKind)?.({
            capabilities: selectedTargetCapabilities ?? selectedAgent.capabilities,
            config: targetConfig,
            isDisabled: false,
            onConfigChange: handleTargetConfigPatch,
            presentationMode: targetPresentationMode,
          }) ?? []
        ).map(applyDefaultControlTiers),
      ]
    : [];
  const supportsTargetTerminalMode = otherAgents.some((agent) =>
    supportsPresentation(agent, "terminal"),
  );
  const supportsTargetGuiMode = otherAgents.some((agent) => supportsPresentation(agent, "gui"));

  // --- Extraction config (source provider) ---
  const hiddenModelIds = useSharedSettings((s) => s.hiddenModels[thread.agentKind]);
  const filteredSourceCaps = sourceAgent
    ? filterHiddenModels(
        capabilitiesForPresentation(sourceAgent.capabilities, sourcePresentationMode),
        hiddenModelIds,
      )
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

  function buildTranscriptContext(): ExtractContextResult | null {
    const state = useAppStore.getState();
    const itemIds = state.runtimeItemIdsByThread[thread.id] ?? [];
    const itemsById = state.runtimeItemsByIdByThread[thread.id];
    if (!itemsById || itemIds.length === 0) return null;

    const transcript = itemIds
      .map((itemId) => itemsById[itemId])
      .filter((item): item is RuntimeChatItem => Boolean(item && !item.parentItemId))
      .map(formatRuntimeItemForHandoff)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n\n");

    if (!transcript.trim()) return null;
    const sourceLabel = sourceAgent?.label ?? thread.agentKind;
    const summary = [
      `Context captured from the ${sourceLabel} chat transcript because provider resume and terminal scrollback were unavailable.`,
      "",
      transcript.length > MAX_TRANSCRIPT_CONTEXT_CHARS
        ? `${transcript.slice(-MAX_TRANSCRIPT_CONTEXT_CHARS)}\n\n[earlier transcript truncated]`
        : transcript,
    ].join("\n");

    return {
      summary,
      sourceProvider: thread.agentKind,
      sourceSessionId: thread.sessionRef?.providerSessionId ?? thread.id,
      ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      extractedAt: new Date().toISOString(),
    };
  }

  async function handleAction(closeOriginal: boolean, inputSegments?: PromptSegment[]) {
    const submission = buildSubmission(inputSegments);
    if (!submission) return;
    setPendingCloseOriginal(closeOriginal);
    setPendingSubmission(submission);
    setLastPresentationMode(selectedKind, targetPresentationMode);

    if (!thread.sessionRef) {
      onContinue(
        selectedKind,
        targetConfig,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        closeOriginal,
        null,
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
        closeOriginal,
        result,
      );
    } catch (err) {
      const fallback = buildTranscriptContext();
      if (fallback) {
        onContinue(
          selectedKind,
          targetConfig,
          targetPresentationMode,
          submission.prompt,
          submission.segments,
          closeOriginal,
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
      pendingCloseOriginal,
      null,
    );
  }

  const canSubmit = Boolean(selectedKind && targetConfig.model);

  return (
    <>
      <Modal.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[760px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Continue in another provider</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="px-5 pb-5 pt-2">
              {phase === "select" && (
                <div className="flex flex-col gap-4">
                  <PresentationModeTabs
                    presentationMode={targetPresentationMode}
                    supportsTerminal={supportsTargetTerminalMode}
                    supportsGui={supportsTargetGuiMode}
                    onChange={handlePresentationModeChange}
                  />
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
                            const idx = imageAttachments.findIndex((a) => a.id === att.id);
                            if (idx >= 0) setLightboxIndex(idx);
                          }}
                        />
                      }
                      inputContent={
                        <MentionInput
                          ref={mentionRef}
                          autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                          compact
                          placeholder={`Tell ${selectedAgent?.label ?? "the target provider"} what to do next...`}
                          projectLocation={props.projectLocation}
                          projectId={thread.projectId}
                          onTextChange={() => undefined}
                          onPasteImage={(file) => {
                            void attachments.addClipboardImage(file, `handoff:${thread.id}`);
                          }}
                          onSubmit={(segments) => {
                            void handleAction(false, segments);
                          }}
                        />
                      }
                      placeholder="Tell the target provider what to do next..."
                      prompt=""
                      submitDisabled={!canSubmit}
                      submitLabel="Fork"
                      onPromptChange={() => undefined}
                      onSubmit={() => {
                        void handleAction(false);
                      }}
                      afterControls={
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
                      }
                    />
                  </div>
                </div>
              )}

              {phase === "extracting" && (
                <div className="flex items-center gap-3 py-2">
                  <PixelLoader size="sm" />
                  <p className="text-sm text-muted">
                    Extracting context from {sourceAgent?.label ?? thread.agentKind}...
                  </p>
                </div>
              )}

              {phase === "error" && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm">Could not extract context.</p>
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
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    isDisabled={!canSubmit}
                    onPress={() => {
                      void handleAction(false);
                    }}
                  >
                    Fork
                  </Button>
                  <Button
                    variant="tertiary"
                    isDisabled={!canSubmit}
                    onPress={() => {
                      void handleAction(true);
                    }}
                  >
                    Move
                  </Button>
                </>
              )}
              {phase === "extracting" && (
                <Button variant="ghost" className="text-muted" onPress={handleCancel}>
                  Cancel
                </Button>
              )}
              {phase === "error" && (
                <>
                  <Button variant="ghost" className="text-muted" onPress={handleCancel}>
                    Cancel
                  </Button>
                  <Button variant="secondary" onPress={handleStartWithoutContext}>
                    Start Without Context
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
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
