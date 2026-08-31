import { useId, useRef, useState } from "react";
import { Monitor, Settings2, Webhook } from "lucide-react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentCapability,
  AgentStatus,
  ProjectDraftConfig,
  ProjectLocation,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { resolveComposerMcpScope } from "@/shared/contracts";
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
import {
  MentionInput,
  type McpMentionItem,
  type MentionInputHandle,
} from "../composer/MentionInput";
import { readThreadToolEnabled, useThreadMentionItems } from "../composer/useThreadMentionItems";
import {
  usePluginMentionItems,
  useSkillSlashCommandState,
} from "@/renderer/components/skills/useSkills";
import {
  COMPUTER_USE_MCP_ID,
  composerMcpServers,
  mcpTogglePatch,
  providerMcpSettingEnabled,
  providerOwnsMcpConfig,
} from "../composer/composerMcpServers";
import {
  pluginLabelsForMcpServers,
  pluginMentionsForAvailableMcp,
  withoutPluginBackedMcpMentions,
} from "../composer/pluginBackedMcp";
import {
  ComposerAddMenu,
  type ComposerCustomMcpItem,
  type ComposerMcpMenuItem,
} from "../composer/ComposerAddMenu";
import { updateProjectMcpServers } from "@/renderer/actions/projectActions";
import { getComputerUseScope } from "../composer/computerUseScope";
import { mergeMcpServers } from "@/shared/contracts/mcpServer";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import {
  bindLeadingSkillUnlessLocalAction,
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
  slashCommandDisplayId,
} from "./threadSlashCommands";
import { carryOverComposerMcpConfig, composerMcpConfig } from "../composer/carryOverMcpConfig";
import { useAttachments, type SaveClipboardImage } from "../composer/useAttachments";
import { flattenSegments } from "../composer/serializeMentions";
import { PresentationModeTabs } from "./PresentationModeTabs";
import {
  agentStatusForPresentation,
  capabilitiesForPresentation,
  filterHiddenModels,
  hasSelectableReasoning,
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
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildTranscriptContext } from "@/renderer/actions/handoffTranscript";
import {
  defaultHandoffPrompt,
  type ProviderHandoffContext,
} from "@/renderer/actions/providerHandoff";
import { resolveProviderHandoffStrategy } from "@/shared/providerHandoff";

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
  projectLocation?: ProjectLocation,
): ThreadConfig {
  const hostPlatform = readBridge()?.platform;
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
    // The MCP servers the user turned on for this task follow it into the
    // target provider, minus the ones that provider cannot honor.
    ...carryOverComposerMcpConfig(
      capabilities,
      presentationMode,
      preferred ?? {},
      projectLocation,
      hostPlatform,
    ),
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
  /** Thread-owner-aware clipboard saver; remote panes upload pasted images to the host. */
  saveClipboardImage?: SaveClipboardImage | undefined;
  onClose: () => void;
  onContinue: (
    targetAgentKind: string,
    targetConfig: ThreadConfig,
    targetPresentationMode: ThreadPresentationMode,
    prompt: string,
    segments: PromptSegment[] | undefined,
    intent: ContinueIntent,
    handoffContext: ProviderHandoffContext,
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

  // Whether this thread's sessions get the app-controls `read_thread` tool —
  // the transcript-reading path a handoff hands to the incoming provider in
  // place of an extracted summary. The per-thread record is the last session's
  // launch-time snapshot, so it is read together with the current settings
  // gate: a tool disabled since then only shows up in the next launch.
  const threadMentionToolsAvailable = useAppStore(
    (s) => s.threadMentionToolsAvailableByThreadId[thread.id] === true,
  );
  const readThreadToolsEnabled = useSharedSettings(readThreadToolEnabled);

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
  // Portal root inside the modal DOM. The mention popover portaled to body
  // would get `inert` from the modal's ariaHideOutside: no scrolling, and
  // clicks fall through to the backdrop and dismiss the dialog.
  const [mentionPortalRoot, setMentionPortalRoot] = useState<HTMLDivElement | null>(null);
  const attachments = useAttachments({
    ...(props.saveClipboardImage ? { saveClipboardImage: props.saveClipboardImage } : {}),
  });

  const selectedAgent = otherAgents.find((a) => a.kind === selectedKind);
  const sourceRuntimeStatus = sourceAgent
    ? agentStatusForPresentation(sourceAgent, sourcePresentationMode, thread.sessionRef)
    : undefined;
  const [targetPresentationMode, setTargetPresentationMode] =
    useState<ThreadPresentationMode>(proposedPresentationMode);

  // --- Target provider config ---
  // The MCP servers this task is already running with. They seed every target
  // config below, so switching providers does not silently drop the tools the
  // work depends on; the ones the target cannot honor are filtered out.
  const sourceMcpConfig = composerMcpConfig(thread.config);
  const [targetConfig, setTargetConfig] = useState<ThreadConfig>(() =>
    proposedAgent
      ? resolveDefaultConfig(
          proposedAgent,
          proposedPresentationMode,
          {
            ...savedConfigForAgent(proposedAgent, props.lastDraftConfig),
            ...preferredConfigPatch(proposedRanking),
            ...sourceMcpConfig,
          },
          props.projectLocation,
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
        resolveDefaultConfig(
          agent,
          nextPresentationMode,
          {
            ...savedConfigForAgent(agent, props.lastDraftConfig),
            ...preferred,
            // Whatever is enabled right now — seeded from the source thread and
            // possibly since toggled in this dialog — not the saved draft's.
            ...composerMcpConfig(targetConfig),
          },
          props.projectLocation,
        ),
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
        nextAgent.kind === selectedKind ? targetConfig : composerMcpConfig(targetConfig),
        props.projectLocation,
      ),
    );
  }

  function handleTargetConfigPatch(patch: Partial<ThreadConfig>) {
    if (!selectedAgent) return;
    setTargetConfig((prev) =>
      resolveDefaultConfig(
        selectedAgent,
        targetPresentationMode,
        { ...prev, ...patch },
        props.projectLocation,
      ),
    );
  }

  // --- Composer affordances (same set the normal composer offers) ---
  // The prompt typed here is the target provider's first turn, so it takes
  // file/thread/plugin/MCP mentions and slash commands exactly like the draft
  // composer that starts any other thread.
  const commandListId = useId();
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const { commands: skillCommands } = useSkillSlashCommandState(
    props.projectLocation,
    selectedKind,
    targetPresentationMode,
  );
  const pluginMentions = usePluginMentionItems(
    props.projectLocation,
    selectedKind,
    targetPresentationMode,
  );
  const threadMentions = useThreadMentionItems(
    {
      kind: "project",
      projectId: thread.projectId,
      currentWorktreePath: thread.worktreePath,
    },
    thread.id,
  );
  const disabledBuiltInMcpServers = useSharedSettings((s) => s.disabledBuiltInMcpServers);
  const userCustomMcpServers = useSharedSettings((s) => s.mcpServers);
  const setUserCustomMcpServers = useSharedSettings((s) => s.setMcpServers);
  const providerMcpSettings = useSharedSettings((s) => s.agentSettings[selectedKind]);
  const projectCustomMcpServers = useAppStore(
    (s) => s.projects.find((project) => project.id === thread.projectId)?.mcpServers,
  );

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
  const targetCapabilities = selectedTargetCapabilities ?? selectedAgent?.capabilities;
  const slashLookupContext = {
    agentKind: selectedKind,
    presentationMode: targetPresentationMode,
    ...(targetCapabilities?.runtimeLabel ? { runtimeLabel: targetCapabilities.runtimeLabel } : {}),
  };
  // Commands that would drive local dialog UI (`/model`, `/effort`, …) are
  // dropped: the pickers beside this composer already own those, and a launch
  // has nowhere to run them. Skills and provider commands ride along as prompt.
  const availableCommands = targetCapabilities
    ? resolveAvailableSlashCommands(undefined, targetCapabilities.slashCommands, {
        ...slashLookupContext,
        hasEffort: hasSelectableReasoning(targetCapabilities, targetConfig.model),
        supportsFast: supportsUsableFastMode(targetCapabilities, targetConfig.model),
        skillCommands,
        ...(targetCapabilities.disabledSkillNames
          ? { disabledSkillNames: targetCapabilities.disabledSkillNames }
          : {}),
      }).filter(
        (command) =>
          !resolveLocalSlashCommandAction(`/${slashCommandDisplayId(command)}`, slashLookupContext),
      )
    : [];
  const filteredCommands = filterSlashCommands(availableCommands, slashQuery);
  const showCommandPanel = filteredCommands.length > 0;

  // `@`-mentions for the servers the target thread will launch with. Registry
  // servers that are off can be turned on from the mention list (it patches the
  // target config); custom servers come from settings and are informational.
  const providerOwnsMcp = targetCapabilities ? providerOwnsMcpConfig(targetCapabilities) : false;
  // Mirrored desktop threads launch from their host's settings. This renderer
  // does not own that MCP snapshot, so showing or mutating its local controls
  // would promise servers the host may not launch.
  const mcpControlsAvailable = targetCapabilities !== undefined && !thread.remoteServerId;
  const mergedCustomMcpServers = mergeMcpServers(
    userCustomMcpServers,
    projectCustomMcpServers ?? [],
  );
  const customMcpServers = mcpControlsAvailable
    ? mergedCustomMcpServers.filter((server) => server.enabled)
    : [];
  // Offer a mention when the provider's composer gates this server per thread,
  // and also whenever the flag is already on — a server carried over from the
  // source thread launches either way, so hiding it would misreport the run.
  const computerUseScope =
    mcpControlsAvailable &&
    disabledBuiltInMcpServers[COMPUTER_USE_MCP_ID] !== true &&
    targetCapabilities
      ? getComputerUseScope(
          targetCapabilities,
          targetPresentationMode,
          props.projectLocation,
          readBridge()?.platform,
        )
      : "none";
  const providerComputerUseEnabled =
    mcpControlsAvailable &&
    providerOwnsMcp &&
    targetCapabilities !== undefined &&
    disabledBuiltInMcpServers[COMPUTER_USE_MCP_ID] !== true &&
    providerMcpSettingEnabled(targetCapabilities, providerMcpSettings, "computerUse");
  const showComputerUseMention =
    mcpControlsAvailable &&
    (providerOwnsMcp
      ? providerComputerUseEnabled
      : computerUseScope !== "none" || targetConfig.computerUse === true) &&
    props.projectLocation.kind !== "wsl" &&
    readBridge()?.platform !== "linux";
  const mcpMentions: McpMentionItem[] =
    mcpControlsAvailable && targetCapabilities
      ? [
          ...(disabledBuiltInMcpServers["app-controls"] !== true && !providerOwnsMcp
            ? [
                {
                  id: "app-controls",
                  name: t`Poracode`,
                  icon: Settings2,
                  enabled: true,
                },
              ]
            : []),
          ...composerMcpServers
            .filter(
              (descriptor) =>
                disabledBuiltInMcpServers[descriptor.id] !== true &&
                descriptor.isAvailable(props.projectLocation) &&
                (providerOwnsMcp
                  ? providerMcpSettingEnabled(
                      targetCapabilities,
                      providerMcpSettings,
                      descriptor.configKey,
                    )
                  : descriptor.getScope(
                      targetCapabilities,
                      targetPresentationMode,
                      props.projectLocation,
                    ) !== "none" || targetConfig[descriptor.configKey] === true),
            )
            .map((descriptor) => ({
              id: descriptor.id,
              name: t(descriptor.label),
              icon: descriptor.icon,
              detail: t`MCP server`,
              enabled: providerOwnsMcp ? true : targetConfig[descriptor.configKey] === true,
            })),
          ...customMcpServers.map((server) => ({
            id: server.id,
            name: server.name,
            icon: Webhook,
            detail: t`MCP server`,
            enabled: true,
          })),
          ...(showComputerUseMention
            ? [
                {
                  id: COMPUTER_USE_MCP_ID,
                  name: t`Computer Use`,
                  icon: Monitor,
                  detail: t`Computer Use`,
                  enabled: providerOwnsMcp ? true : targetConfig.computerUse === true,
                },
              ]
            : []),
        ]
      : [];
  const composerPluginMentions = pluginMentionsForAvailableMcp(pluginMentions, mcpMentions);
  const composerMcpMentions = withoutPluginBackedMcpMentions(mcpMentions, composerPluginMentions);
  const composerPluginLabels = pluginLabelsForMcpServers(composerPluginMentions);

  // "+" menu rows for this switch. Unlike the draft composer's menu — which
  // edits the standing default for *future* threads — these edit the config of
  // the one launch being set up here, preselected from the servers the thread
  // already runs with. Toggling off leaves the user's standing defaults alone.
  const mcpMenuServers: ComposerMcpMenuItem[] =
    mcpControlsAvailable && targetCapabilities
      ? composerMcpServers.map((descriptor) => {
          const providerSettingEnabled =
            providerOwnsMcp &&
            providerMcpSettingEnabled(
              targetCapabilities,
              providerMcpSettings,
              descriptor.configKey,
            );
          return {
            descriptor,
            enabled: providerOwnsMcp
              ? providerSettingEnabled
              : targetConfig[descriptor.configKey] === true,
            visible:
              disabledBuiltInMcpServers[descriptor.id] !== true &&
              descriptor.isAvailable(props.projectLocation) &&
              (!providerOwnsMcp || providerSettingEnabled),
            onToggle: (next: boolean) => {
              if (!providerOwnsMcp) {
                handleTargetConfigPatch(mcpTogglePatch(descriptor.configKey, next));
              }
            },
          };
        })
      : [];
  // Custom servers bind at launch from settings, not per-thread config, so
  // these rows flip the same persistent switch the MCP Servers page does — the
  // draft composer's menu behaves identically.
  const projectCustomMcpIds = new Set((projectCustomMcpServers ?? []).map((server) => server.id));
  const mcpMenuCustomServers: ComposerCustomMcpItem[] = (
    mcpControlsAvailable
      ? providerOwnsMcp
        ? mergedCustomMcpServers.filter((server) => server.enabled)
        : mergedCustomMcpServers
      : []
  ).map((server) => {
    const isProject = projectCustomMcpIds.has(server.id);
    const scopedServers = isProject ? (projectCustomMcpServers ?? []) : userCustomMcpServers;
    return {
      id: `${isProject ? "project" : "user"}:${server.id}`,
      name: server.name,
      enabled: server.enabled,
      ...(providerOwnsMcp
        ? {}
        : {
            onToggle: (next: boolean) => {
              const nextServers = scopedServers.map((item) =>
                item.id === server.id ? { ...item, enabled: next } : item,
              );
              if (isProject) updateProjectMcpServers(thread.projectId, nextServers);
              else setUserCustomMcpServers(nextServers);
            },
          }),
    };
  });

  function handleMcpMentionSelect(id: string) {
    if (providerOwnsMcp) return;
    if (id === COMPUTER_USE_MCP_ID) {
      handleTargetConfigPatch({ computerUse: true });
      return;
    }
    const descriptor = composerMcpServers.find((candidate) => candidate.id === id);
    if (descriptor) handleTargetConfigPatch(mcpTogglePatch(descriptor.configKey, true));
  }

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
  /**
   * Whether this handoff hands over the thread id or a written context file —
   * the chat→chat / everything-else split described on
   * `resolveProviderHandoffStrategy`.
   */
  function handoffStrategy(intent: ContinueIntent) {
    return resolveProviderHandoffStrategy({
      intent,
      sourcePresentationMode,
      targetPresentationMode,
      isMirroredThread: thread.remoteServerId !== undefined,
      readThreadToolEnabled: readThreadToolsEnabled,
      threadResolvedReadThreadTool: threadMentionToolsAvailable,
      targetReadThreadToolGuaranteed:
        targetCapabilities !== undefined &&
        resolveComposerMcpScope(targetCapabilities.mcpScope, targetPresentationMode) === "always",
    });
  }

  function buildSubmission(
    intent: ContinueIntent,
    inputSegments?: PromptSegment[],
  ): PendingSubmission | null {
    // A typed `/skill …` becomes a real skill segment, the same delivery path a
    // chip insertion takes, so the target provider receives the skill rather
    // than literal slash text.
    const composerSegments = bindLeadingSkillUnlessLocalAction(
      inputSegments ?? mentionRef.current?.serializeSegments() ?? [],
      availableCommands,
      slashLookupContext,
    );
    const allSegments = [...attachments.toSegments(), ...composerSegments];
    const flatPrompt = flattenSegments(allSegments);
    if (!flatPrompt.trim()) {
      return { prompt: defaultHandoffPrompt(handoffStrategy(intent)) };
    }
    return {
      prompt: flatPrompt,
      ...(allSegments.length > 0 ? { segments: allSegments } : {}),
    };
  }

  async function handleAction(intent: ContinueIntent, inputSegments?: PromptSegment[]) {
    const submission = buildSubmission(intent, inputSegments);
    if (!submission) return;
    setPendingIntent(intent);
    setPendingSubmission(submission);
    setLastPresentationMode(selectedKind, targetPresentationMode);

    // chat → chat: skip extraction and hand off immediately. The thread keeps
    // its transcript, so the incoming provider reads it with `read_thread`
    // instead of costing the outgoing provider a one-shot summary run.
    if (handoffStrategy(intent) === "thread-transcript") {
      onContinue(
        selectedKind,
        targetConfig,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        { strategy: "thread-transcript" },
      );
      return;
    }

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
        { strategy: "context-file", extracted: fallback },
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
        { strategy: "context-file", extracted: result },
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
          { strategy: "context-file", extracted: fallback },
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
    // Every error-phase path records a submission first (setPendingSubmission
    // runs before extraction starts), so there is nothing to re-derive here.
    const submission = pendingSubmission;
    if (!submission) return;
    onContinue(
      selectedKind,
      targetConfig,
      targetPresentationMode,
      submission.prompt,
      submission.segments,
      pendingIntent,
      { strategy: "context-file", extracted: null },
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
            <div ref={setMentionPortalRoot} className="contents" />
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
                  {showCommandPanel ? (
                    <ThreadCommandPanel
                      commands={filteredCommands}
                      activeIndex={slashActiveIndex}
                      listId={commandListId}
                      onActiveIndexChange={setSlashActiveIndex}
                      onSelect={(command) => {
                        mentionRef.current?.insertSlashCommand(command);
                        setSlashQuery(null);
                      }}
                    />
                  ) : null}
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
                          mcpMentions={composerMcpMentions}
                          pluginMentions={composerPluginMentions}
                          threadMentions={threadMentions}
                          onMcpMentionSelect={handleMcpMentionSelect}
                          popoverPortalContainer={mentionPortalRoot}
                          {...(showCommandPanel
                            ? {
                                commandListId,
                                commandActiveDescendant: `${commandListId}-option-${slashActiveIndex}`,
                              }
                            : {})}
                          onTextChange={() => undefined}
                          onPasteImage={(file) => {
                            void attachments.addClipboardImage(file, `handoff:${thread.id}`);
                          }}
                          onInterceptKey={(e) => {
                            if (!showCommandPanel) return false;
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
                        <ComposerAddMenu
                          mcpServers={mcpMenuServers}
                          customMcpServers={mcpMenuCustomServers}
                          pluginLabels={composerPluginLabels}
                          {...(providerOwnsMcp && mcpControlsAvailable
                            ? {
                                readOnly: true,
                                readOnlyCaption: <Trans>Change servers in provider settings</Trans>,
                              }
                            : {})}
                          showFileOption
                          onPickFiles={() => {
                            void (
                              props.pickFiles ? props.pickFiles() : readBridge().pickFiles()
                            ).then((paths) => {
                              if (paths) attachments.addFiles(paths);
                            });
                          }}
                          computerUse={{
                            enabled: providerOwnsMcp
                              ? providerComputerUseEnabled
                              : targetConfig.computerUse === true,
                            visible: showComputerUseMention,
                            onToggle: (next) => {
                              if (!providerOwnsMcp) handleTargetConfigPatch({ computerUse: next });
                            },
                          }}
                        />
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
