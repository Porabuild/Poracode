import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Settings2, Webhook } from "lucide-react";
import { Modal, toast } from "@heroui/react";
import { friendlyError } from "@/shared/messages";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentStatus,
  ProjectDraftConfig,
  ProjectLocation,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { resolveLaunchPluginOverrides } from "@/shared/contracts";
import { Button } from "@/renderer/components/common/Button";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { readBridge } from "@/renderer/bridge";
import { useAgentSlashCommandCatalog } from "@/renderer/hooks/useAgentSlashCommandCatalog";
import { ThreadComposer } from "./ThreadComposer";
import { isPlanModeControl } from "../providers/composerControlBuilders";
import { savedProviderTargetConfig, useProviderTargetSelection } from "./providerTargetSelection";
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
import { openCrewsSettings, openMcpServersSettings } from "@/renderer/actions/panelActions";
import { getComputerUseScope } from "../composer/computerUseScope";
import { composerCustomMcpItems } from "../composer/composerCustomMcpServers";
import { useResidentProjectMcpServers } from "@/renderer/state/projectSettings/useResidentProjectMcpServers";
import { mergeMcpServers } from "@/shared/contracts/mcpServer";
import {
  canLeadCrew,
  crewBindingFromSavedCrew,
  threadCrewBinding,
  type CrewMemberSelection,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import { applyCrewComposerControls } from "../crew/applyCrewComposerControls";
import {
  crewModelLabelOf,
  crewPickerEntry,
  crewSummary,
  leadSelectionOf,
  newCrewBinding,
  savedCrewFor,
} from "../crew/crewComposerModel";
import { useCrewHelperOptions } from "../crew/crewHelperOptions";
import { CREW_ROLE_TEMPLATE_DESCRIPTORS, DEFAULT_CREW_ROLE_ID } from "../crew/crewRoleTemplates";
import { buildProviderModelMenuProviders } from "./buildModelPickerControls";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import {
  bindLeadingSkillUnlessLocalAction,
  filterSlashCommands,
  handleSlashCommandPanelKeyDown,
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
} from "./threadSlashCommands";
import { slashCommandDisplayId } from "./slashCommandMatching";
import { composerMcpConfig } from "../composer/carryOverMcpConfig";
import { useAttachments } from "../composer/useAttachments";
import { flattenSegments } from "../composer/serializeMentions";
import { PresentationModeTabs } from "./PresentationModeTabs";
import {
  agentStatusForPresentation,
  capabilitiesForPresentation,
  filterHiddenModels,
  hasSelectableReasoning,
} from "@/shared/agentSelection";
import { crossagentRankingPreferences } from "@/shared/crossagentRanking";
import {
  continuesInPlace,
  rankContinueProviders,
  resolveInitialPresentationMode,
  supportsPresentation,
} from "@/shared/continueProviderRanking";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import { useAppStore } from "@/renderer/state/appStore";
import { hostRunsOnThisMachine } from "@/renderer/state/hostLocality";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  buildTranscriptContext,
  handoffTranscriptBudget,
} from "@/renderer/actions/handoffTranscript";
import {
  defaultHandoffPrompt,
  type ProviderHandoffContext,
} from "@/renderer/actions/providerHandoff";
import {
  resolveProviderHandoffStrategy,
  targetGuaranteesReadThreadTool,
} from "@/shared/providerHandoff";

import {
  preferredConfigPatch,
  resolveDefaultConfig,
  visibleCapabilities,
  withoutLaunchSelection,
} from "./continueTargetConfig";

type Phase = "select" | "extracting" | "error";
type PendingSubmission = { prompt: string; segments?: PromptSegment[] };
type CommandPanelPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "above" | "below";
};
/**
 * `fork` opens a second thread beside the original; `switch` continues the same
 * task in the target provider — in place for a chat target, as a replacement
 * thread when the target is a terminal.
 */
export type ContinueIntent = "fork" | "switch";

export function ContinueInProviderDialog(props: {
  isOpen: boolean;
  thread: Thread;
  projectLocation: ProjectLocation;
  installedAgents: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  /** Thread-owner-aware file picker; remote panes pass one that uploads to the host. */
  pickFiles?: (() => Promise<string[] | null>) | undefined;
  /** Thread-owner-aware clipboard saver; remote panes upload pasted images to the host. */

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
  const allHiddenModels = useSharedSettings((s) => s.hiddenModels);
  // App-wide per-provider draft settings — the same source the draft composer
  // resolves from, so the permission/model posture a user last set for a
  // provider shows up here too, not only when that provider happens to be the
  // project's last-used one.
  const providerConfigs = useSharedSettings((s) => s.providerConfigs);
  const providerModelPreferences = useSharedSettings((s) => s.providerModelPreferences);
  const savedCrews = useSharedSettings((s) => s.crews);
  const upsertCrew = useSharedSettings((s) => s.upsertCrew);
  const helperOptions = useCrewHelperOptions();

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

  // Propose the provider the user actually reaches for most. Ranking runs
  // against the hidden-filtered surface the pickers display, so a hidden
  // model can never be proposed; `proposedRanking` then feeds the initial
  // config below when the provider has no saved last-selected model.
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
    (agent, mode) => allHiddenModels[modelVisibilityKey(agent.kind, mode)],
  );
  const proposedAgent =
    otherAgents.find((a) => a.kind === rankedTargets[0]?.provider) ?? otherAgents[0];
  const proposedRanking = rankedTargets.find((entry) => entry.provider === proposedAgent?.kind);
  const proposedPresentationMode = resolveInitialPresentationMode(
    proposedAgent,
    lastPresentationModeByAgent,
    sourcePresentationMode,
  );

  const [phase, setPhase] = useState<Phase>("select");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingIntent, setPendingIntent] = useState<ContinueIntent>("fork");
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const mentionRef = useRef<MentionInputHandle>(null);
  const composerContainerRef = useRef<HTMLDivElement>(null);
  // Portal root inside the modal overlay but outside the clipped dialog. A
  // body portal gets `inert` from ariaHideOutside, while a dialog descendant
  // clips and offsets the fixed-position composer menus.
  const [mentionPortalRoot, setMentionPortalRoot] = useState<HTMLDivElement | null>(null);
  const attachments = useAttachments({
    source: { ...(thread.remoteServerId ? { remoteServerId: thread.remoteServerId } : {}) },
  });

  // --- Target provider config ---
  // The MCP servers this task is already running with. They seed every target
  // config below, so switching providers does not silently drop the tools the
  // work depends on; the ones the target cannot honor are filtered out.
  const sourceMcpConfig = composerMcpConfig(thread.config);
  const {
    agentKind: selectedKind,
    config: targetConfig,
    presentationMode: targetPresentationMode,
    agent: selectedAgent,
    capabilities: selectedTargetCapabilities,
    controls: targetControls,
    handleProviderChange,
    handlePresentationModeChange,
    handleConfigPatch: handleTargetConfigPatch,
  } = useProviderTargetSelection({
    agents: otherAgents,
    initialAgentKind: proposedAgent?.kind,
    initialPresentationMode: proposedPresentationMode,
    resolveInitialConfig: (agent, mode) => {
      const saved = savedProviderTargetConfig(agent, mode, {
        lastDraftConfig: props.lastDraftConfig,
        providerConfigs,
        providerModelPreferences,
        hiddenModelsByAgent: allHiddenModels,
      });
      const capabilities = visibleCapabilities(agent, mode, allHiddenModels);
      // The saved model arrives verbatim, without a check against this
      // surface: it may have been hidden since, dropped from the catalog, or
      // saved on the other presentation surface. It only takes precedence
      // while the pickers can still offer it.
      const savedModelUsable =
        saved?.model !== undefined && capabilities.models.some((model) => model.id === saved.model);
      return resolveDefaultConfig(
        capabilities,
        mode,
        {
          // The model the user last selected for this provider wins as a
          // whole tuple, exactly as a new-thread draft opens. The ranking's
          // most-used tuple only fills in when no usable selection is saved,
          // together with the saved non-model fields: spreading both tuples
          // would let the ranked model stomp the saved one or leak its effort.
          ...(savedModelUsable
            ? saved
            : {
                ...(agent.kind === proposedRanking?.provider
                  ? preferredConfigPatch(proposedRanking)
                  : {}),
                ...withoutLaunchSelection(saved),
              }),
          ...sourceMcpConfig,
        },
        props.projectLocation,
      );
    },
    projectLocation: props.projectLocation,
    lastDraftConfig: props.lastDraftConfig,
    providerConfigs,
    providerModelPreferences,
    hiddenModelsByAgent: allHiddenModels,
    lastPresentationModeByAgent,
    sourcePresentationMode,
    setLastPresentationMode,
  });
  useAgentSlashCommandCatalog(thread.remoteServerId, selectedAgent?.kind, props.isOpen);
  const sourceRuntimeStatus = sourceAgent
    ? agentStatusForPresentation(sourceAgent, sourcePresentationMode, thread.sessionRef)
    : undefined;

  const sourceCrew = threadCrewBinding(thread.config);
  // The crew edited in this dialog: `undefined` leaves the source thread's crew
  // carried over, `null` clears it, and a binding is a crew picked, built, or
  // edited here. Once touched, submitting writes an explicit `crew: null` for a
  // cleared crew instead of letting an in-place switch keep the source's.
  const [crewEdit, setCrewEdit] = useState<ThreadCrewBinding | null | undefined>(undefined);
  const crewTouched = crewEdit !== undefined;
  const targetCrew = crewTouched ? (crewEdit ?? undefined) : sourceCrew;
  const [crewOpenSignal, setCrewOpenSignal] = useState(0);
  function commitTargetCrew(next: ThreadCrewBinding | undefined) {
    setCrewEdit(next ?? null);
  }
  const targetCanLeadCrew = Boolean(
    selectedAgent &&
    canLeadCrew(
      capabilitiesForPresentation(selectedAgent.capabilities, targetPresentationMode),
      targetPresentationMode,
    ),
  );
  // The crew the continued thread will actually launch with: none when the
  // target cannot lead one, so the crew stays behind. The roster, the picker's
  // current crew, and the submitted config all follow this one value.
  const launchCrew = targetCanLeadCrew ? targetCrew : undefined;
  const targetConfigForHandoff =
    sourceCrew || crewTouched ? { ...targetConfig, crew: launchCrew ?? null } : targetConfig;

  // --- Crew selection (the same picker + roster the draft composer offers) ---
  const roleTemplates = CREW_ROLE_TEMPLATE_DESCRIPTORS.map(({ brief, label, ...template }) => ({
    ...template,
    label: t(label),
    ...(brief ? { brief: t(brief) } : {}),
  }));
  const crewLeadProviders = buildProviderModelMenuProviders(otherAgents, {
    presentationMode: targetPresentationMode,
    hiddenModelsByAgent: allHiddenModels,
    filterAgent: (agent) =>
      canLeadCrew(
        capabilitiesForPresentation(agent.capabilities, targetPresentationMode),
        targetPresentationMode,
      ),
  });
  const targetLead = leadSelectionOf(selectedKind, targetConfig);
  const crewsOffered = targetPresentationMode === "gui" || targetCanLeadCrew;
  const defaultHelper = helperOptions.defaultSelectionFor(targetLead);
  const modelLabelOf = (selection: CrewMemberSelection) =>
    crewModelLabelOf(installedAgents, selection);
  function leadFields(selection: CrewMemberSelection): Partial<ThreadConfig> {
    return {
      effort: selection.effort ?? "",
      fast: selection.fast ?? false,
      ...(selection.contextSize ? { contextSize: selection.contextSize } : {}),
    };
  }
  function leadPatch(selection: CrewMemberSelection): Partial<ThreadConfig> {
    return { model: selection.model, ...leadFields(selection) };
  }
  // The placeholder expressions are part of the Lingui message id, so they stay
  // inline: this keeps the toast on the catalog entry the draft composer
  // already ships translations for.
  function warnLeadUnavailable(agentKind: string, provider: { label: string } | undefined) {
    toast.warning(
      t`${provider?.label ?? installedAgents.find((agent) => agent.kind === agentKind)?.label ?? agentKind} isn't available, so ${modelLabelOf(targetLead)} stays the lead.`,
    );
  }
  function handleCrewChoice(choice: { crewId: string } | { newCrew: true }) {
    // Same reasoning for `label`: the placeholder name is part of the message id.
    const label = modelLabelOf(targetLead);
    if ("newCrew" in choice) {
      const sidekick = roleTemplates.find((template) => template.id === DEFAULT_CREW_ROLE_ID);
      if (!defaultHelper || !sidekick) return;
      commitTargetCrew(newCrewBinding(defaultHelper, sidekick));
      // Open the roster for editing once it mounts: the crew control opens
      // when the signal changes after its first commit, and React flushes
      // this event's commit before the microtask runs.
      queueMicrotask(() => setCrewOpenSignal((current) => current + 1));
      return;
    }
    const saved = savedCrews.find((crew) => crew.id === choice.crewId);
    if (!saved) return;
    const binding = crewBindingFromSavedCrew(saved);
    const target = crewLeadProviders.find((provider) => provider.kind === saved.lead.agentKind);
    const targetModel = target?.capabilities.models.find(
      (candidate) => candidate.id === saved.lead.model,
    );
    if (!target || !targetModel) {
      // The crew's lead cannot continue this thread (unavailable, or the
      // source provider itself, which this dialog never targets). Keep the
      // crew under the current lead when it can lead one, like the draft.
      if (!targetCanLeadCrew) {
        toast.danger(t`${label} can't lead a crew. Pick another model first.`);
        return;
      }
      commitTargetCrew(binding);
      warnLeadUnavailable(saved.lead.agentKind, target);
      return;
    }
    commitTargetCrew(binding);
    handleProviderChange(saved.lead.agentKind, leadPatch(saved.lead));
  }
  const crewSection = crewsOffered
    ? {
        entries: savedCrews.map((crew) =>
          crewPickerEntry(crew, helperOptions.modelLabelOf, {
            lead: t`Lead`,
            readOnly: t`Read-only`,
          }),
        ),
        ...(launchCrew?.crewId ? { currentCrewId: launchCrew.crewId } : {}),
        ...(launchCrew ? { current: { name: launchCrew.name ?? t`Crew` } } : {}),
        canCreate: targetCanLeadCrew && defaultHelper !== undefined,
        onSelect: handleCrewChoice,
      }
    : undefined;
  function saveTargetCrew(crew: SavedCrew, binding: ThreadCrewBinding) {
    upsertCrew(crew);
    commitTargetCrew(binding);
  }
  const activeSavedCrew = savedCrewFor(launchCrew, savedCrews);
  const crewRoster = launchCrew
    ? {
        binding: launchCrew,
        lead: targetLead,
        ...(activeSavedCrew ? { savedCrew: activeSavedCrew } : {}),
        helperOptions,
        roleTemplates,
        leadProviders: crewLeadProviders,
        ...(defaultHelper ? { defaultHelper } : {}),
        summary: crewSummary(
          modelLabelOf(targetLead),
          launchCrew.roles,
          helperOptions.modelLabelOf,
        ),
        isDraft: true,
        isDisabled: false,
        onBindingChange: (binding: ThreadCrewBinding) => commitTargetCrew(binding),
        onLeadChange: (selection: CrewMemberSelection) => {
          const kindChanged = selection.agentKind !== targetLead.agentKind;
          if (kindChanged) {
            // The roster's Reset hands back the saved crew's lead without
            // going through `crewLeadProviders`. That lead can be the source
            // provider (excluded from this dialog's targets) or an unavailable
            // one; retargeting onto it would strand the dialog on an agent it
            // does not offer, so keep the current lead.
            const target = crewLeadProviders.find(
              (provider) => provider.kind === selection.agentKind,
            );
            if (!target?.capabilities.models.some((model) => model.id === selection.model)) {
              warnLeadUnavailable(selection.agentKind, target);
              return;
            }
          }
          if (kindChanged || selection.model !== targetLead.model) {
            handleProviderChange(selection.agentKind, leadPatch(selection));
          } else {
            handleTargetConfigPatch(leadFields(selection));
          }
        },
        onSaveToCrew: saveTargetCrew,
        onSaveAsNewCrew: saveTargetCrew,
        onEditInSettings: () => {
          // Settings sit behind the modal — dismiss it first.
          handleCancel();
          openCrewsSettings(launchCrew.crewId);
        },
      }
    : undefined;
  // A thread that already ran with a crew keeps one: a plain pick only
  // retargets its lead, as it did before crews could be picked here, so a
  // roster edit or a swap to another crew can never drop it silently. A crew
  // added to a plain thread is a selection like in the draft composer, so a
  // plain pick leaves it. Crew picks bypass this handler: `handleCrewChoice`
  // changes the lead directly.
  const crewAwareControls = targetControls.map((control) =>
    control.kind === "provider-model"
      ? {
          ...control,
          onChange: (next: Parameters<typeof control.onChange>[0]) => {
            if (targetCrew && !sourceCrew) commitTargetCrew(undefined);
            control.onChange(next);
          },
        }
      : control,
  );
  const dialogControls = crewSection
    ? applyCrewComposerControls(crewAwareControls, {
        crewSection,
        ...(crewRoster ? { roster: crewRoster } : {}),
        openSignal: crewOpenSignal,
      })
    : crewAwareControls;

  // --- Composer affordances (same set the normal composer offers) ---
  // The prompt typed here is the target provider's first turn, so it takes
  // file/thread/plugin/MCP mentions and slash commands exactly like the draft
  // composer that starts any other thread.
  const commandListId = useId();
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [commandPanelPosition, setCommandPanelPosition] = useState<CommandPanelPosition | null>(
    null,
  );
  const projectPluginOverrides = useAppStore(
    (s) => s.projects.find((project) => project.id === thread.projectId)?.pluginOverrides,
  );
  const pluginOverrides = resolveLaunchPluginOverrides(
    projectPluginOverrides,
    thread.config.pluginOverrides,
  );
  const { commands: skillCommands } = useSkillSlashCommandState(
    props.projectLocation,
    selectedKind,
    targetPresentationMode,
    pluginOverrides,
  );
  const pluginMentions = usePluginMentionItems(
    props.projectLocation,
    selectedKind,
    targetPresentationMode,
    pluginOverrides,
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
  const providerMcpSettings = useSharedSettings((s) => s.agentSettings[selectedKind]);
  const threadProject = useAppStore((s) =>
    s.projects.find((project) => project.id === thread.projectId),
  );
  useResidentProjectMcpServers(threadProject);
  const projectCustomMcpServers = threadProject?.mcpServers;

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

  useLayoutEffect(() => {
    const anchor = composerContainerRef.current;
    if (!showCommandPanel || !anchor) {
      setCommandPanelPosition(null);
      return;
    }
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const spaceAbove = rect.top - 8;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const above = spaceAbove >= 160 || spaceAbove >= spaceBelow;
      const width = Math.min(480, window.innerWidth - 16);
      const next: CommandPanelPosition = {
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: above ? rect.top - 6 : rect.bottom + 6,
        width,
        maxHeight: Math.max(48, Math.min(320, above ? spaceAbove : spaceBelow)),
        placement: above ? "above" : "below",
      };
      setCommandPanelPosition((previous) =>
        previous?.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.maxHeight === next.maxHeight &&
        previous.placement === next.placement
          ? previous
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    // Provider/model switches above the composer can push it without resizing
    // it — the dialog recenters around the new content, which the anchor
    // observer cannot see — so watch the dialog box too and the panel tracks
    // those shifts. The command count needs no dependency: the panel is
    // portal-positioned from the anchor rect, so a longer list never moves
    // the anchor and re-running would be a no-op (the position setter keeps
    // identical values).
    const animatedContainer = anchor.closest(".modal__container");
    if (animatedContainer) observer.observe(animatedContainer);
    animatedContainer?.addEventListener("animationend", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      animatedContainer?.removeEventListener("animationend", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showCommandPanel]);

  // Restart keyboard navigation at the top whenever the query or the result
  // set changes, tracked as a render snapshot instead of a sync setState in
  // an effect.
  const slashResetKey = `${slashQuery ?? ""}\0${filteredCommands.length}`;
  const [prevSlashResetKey, setPrevSlashResetKey] = useState<string | null>(null);
  if (prevSlashResetKey !== slashResetKey) {
    setPrevSlashResetKey(slashResetKey);
    setSlashActiveIndex(0);
  }

  // `@`-mentions for the servers the target thread will launch with. Registry
  // servers that are off can be turned on from the mention list (it patches the
  // target config); custom servers come from settings and are informational.
  const providerOwnsMcp = targetCapabilities ? providerOwnsMcpConfig(targetCapabilities) : false;
  // The MCP settings and server lists read here are this machine's. A thread
  // on another host launches from that host's own settings, which this
  // renderer does not own, so showing or mutating the local controls would
  // promise servers the host may not launch.
  const settingsOwnedHere = hostRunsOnThisMachine(thread);
  const mcpControlsAvailable = targetCapabilities !== undefined && settingsOwnedHere;
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
      ? getComputerUseScope(targetCapabilities, targetPresentationMode, props.projectLocation)
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
    props.projectLocation.kind !== "wsl";
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
  const mcpMenuCustomServers: ComposerCustomMcpItem[] = composerCustomMcpItems({
    servers: mcpControlsAvailable
      ? providerOwnsMcp
        ? mergedCustomMcpServers.filter((server) => server.enabled)
        : mergedCustomMcpServers
      : [],
    userServers: userCustomMcpServers,
    projectServers: projectCustomMcpServers ?? [],
    projectId: thread.projectId,
    projectLocation: props.projectLocation,
    editable: !providerOwnsMcp,
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
   * Whether this handoff hands over a thread to read or a written context
   * file — the chat→chat / everything-else split described on
   * `resolveProviderHandoffStrategy`. The same for a switch and a fork.
   */
  function handoffStrategy() {
    return resolveProviderHandoffStrategy({
      sourcePresentationMode,
      targetPresentationMode,
      // Local settings can veto the last session's launch snapshot. A paired
      // host reports its own resolved tool availability; this machine's
      // settings say nothing about whether that host can read its history.
      readThreadToolEnabled: settingsOwnedHere
        ? readThreadToolsEnabled
        : threadMentionToolsAvailable,
      threadResolvedReadThreadTool: threadMentionToolsAvailable,
      targetReadThreadToolGuaranteed:
        targetCapabilities !== undefined &&
        targetGuaranteesReadThreadTool(targetCapabilities, targetPresentationMode),
    });
  }

  function buildSubmission(inputSegments?: PromptSegment[]): PendingSubmission | null {
    if (attachments.hasPendingUploads()) return null;
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
      return { prompt: defaultHandoffPrompt(handoffStrategy()) };
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

    // chat → chat: skip extraction and hand off immediately. The source rows
    // stay in the app, so the incoming provider reads them with `read_thread`
    // — its own thread on a switch, the source thread via a mention on a fork.
    if (handoffStrategy() === "thread-transcript") {
      onContinue(
        selectedKind,
        targetConfigForHandoff,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        { strategy: "thread-transcript" },
      );
      return;
    }

    // A chat source keeps its rows, so the new provider gets the stored chat
    // history — messages first, key tool activity after — instead of a
    // compaction. A summary would cost a full turn on the outgoing provider
    // (often the one that just ran out of quota) and decide what matters
    // before the new provider can. This holds whether or not the user typed a
    // prompt: a typed prompt narrows the next step, not the history behind it.
    // A terminal source has no stored rows and still goes through extraction.
    const history = buildTranscriptContext(
      thread,
      sourceAgent?.label ?? thread.agentKind,
      handoffTranscriptBudget(targetConfig.contextSize),
    );
    if (history) {
      onContinue(
        selectedKind,
        targetConfigForHandoff,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        { strategy: "context-file", extracted: history },
      );
      return;
    }

    if (!thread.sessionRef) {
      // Nothing stored and no session to extract from. The new provider starts
      // without context.
      onContinue(
        selectedKind,
        targetConfigForHandoff,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        { strategy: "context-file", extracted: null },
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
        selection: { model: extractModel, effort: effectiveExtractEffort },
      });
      onContinue(
        selectedKind,
        targetConfigForHandoff,
        targetPresentationMode,
        submission.prompt,
        submission.segments,
        intent,
        { strategy: "context-file", extracted: result },
      );
    } catch (err) {
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
      targetConfigForHandoff,
      targetPresentationMode,
      submission.prompt,
      submission.segments,
      pendingIntent,
      { strategy: "context-file", extracted: null },
    );
  }

  const canSubmit = Boolean(selectedKind && targetConfig.model) && !attachments.isUploading;
  const targetProviderFallback = t`the target provider`;
  // Named for the catalog entries the carry-over captions already ship with
  // (the placeholder name is part of the Lingui message id).
  const sourceCrewName = targetCrew?.name ?? t`Crew`;
  const targetProviderLabel = selectedAgent?.label ?? targetProviderFallback;
  const switchOpensNewThread = !continuesInPlace(sourcePresentationMode, targetPresentationMode);

  return (
    <>
      <Modal.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <Modal.Container>
          <div ref={setMentionPortalRoot} className="pointer-events-none fixed inset-0 z-50" />
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
                    {targetCrew && !targetCanLeadCrew ? (
                      <p className="text-center text-xs text-muted">
                        {t`${sourceCrewName} stays behind: ${targetProviderLabel} can't lead a crew.`}
                      </p>
                    ) : launchCrew && !crewTouched ? (
                      <p className="text-center text-xs text-muted">
                        {t`${sourceCrewName} comes along.`}
                      </p>
                    ) : null}
                  </div>
                  <div ref={composerContainerRef} className="relative flex flex-col gap-1.5">
                    {commandPanelPosition && mentionPortalRoot
                      ? createPortal(
                          <div
                            className="pointer-events-auto fixed"
                            style={{
                              left: commandPanelPosition.left,
                              width: commandPanelPosition.width,
                              top: commandPanelPosition.top,
                              maxHeight: commandPanelPosition.maxHeight,
                              transform:
                                commandPanelPosition.placement === "above"
                                  ? "translateY(-100%)"
                                  : undefined,
                            }}
                          >
                            <ThreadCommandPanel
                              appearance="popover"
                              commands={filteredCommands}
                              query={slashQuery}
                              activeIndex={slashActiveIndex}
                              listId={commandListId}
                              maxHeight={commandPanelPosition.maxHeight}
                              onActiveIndexChange={setSlashActiveIndex}
                              onSelect={(command) => {
                                mentionRef.current?.insertSlashCommand(command);
                                setSlashQuery(null);
                              }}
                            />
                          </div>,
                          mentionPortalRoot,
                        )
                      : null}
                    <ThreadComposer
                      autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- desktop app, expected UX
                      compact
                      variant="draft"
                      hideSubmitButton
                      controls={dialogControls}
                      toolbarLayoutKey={[
                        selectedKind,
                        targetPresentationMode,
                        targetConfig.model,
                        targetConfig.effort ?? "",
                        targetConfig.contextSize ?? "",
                        targetConfig.fast ? "fast" : "normal",
                        targetConfig.thinking ? "thinking" : "standard",
                        launchCrew
                          ? `crew:${launchCrew.crewId ?? launchCrew.name ?? "custom"}:${launchCrew.roles.length}`
                          : "no-crew",
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
                          onPreviewPdf={(att) => openPdfPreview(att)}
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
                            void attachments
                              .addClipboardImage(file)
                              .catch((error: unknown) => toast.danger(friendlyError(error)));
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
                          submitOnEnter={!showCommandPanel}
                          onSubmit={(segments) => {
                            void handleAction("switch", segments);
                          }}
                        />
                      }
                      placeholder={t`Tell the target provider what to do next...`}
                      prompt=""
                      submitDisabled={!canSubmit}
                      submitLabel={t`Switch`}
                      onPromptChange={() => undefined}
                      onSubmit={() => {
                        void handleAction("switch");
                      }}
                      afterControls={
                        <ComposerAddMenu
                          planControl={targetControls.find(isPlanModeControl)}
                          mcpServers={mcpMenuServers}
                          customMcpServers={mcpMenuCustomServers}
                          onManageMcpServers={() => {
                            // Settings sit behind the modal — dismiss it first.
                            handleCancel();
                            openMcpServersSettings();
                          }}
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
