import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "@heroui/react";
import type {
  AgentStatus,
  Project,
  ProjectDraftConfig,
  ProviderDraftConfig,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { HOME_PROJECT_NAME, isHomeProjectId } from "@/shared/homeScope";
import { readBridge } from "@/renderer/bridge";
import { getComposerControls } from "@/renderer/components/providers";
import { getConfigNormalizer } from "@/renderer/components/providers/ProviderIcon";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import { useGitStore } from "@/renderer/state/gitStore";
import { PixelLoader } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";
import { capabilitiesForPresentation, filterHiddenModels } from "./threadComposerOptions";
import {
  agentWithCapabilities,
  formatAgentList,
  formatEffortLabel,
  resolveContextSizeValue,
  resolveEffortValue,
  resolveFastValue,
  resolveInitialPresentationMode,
  resolveModelValue,
  resolvePreferredAgentKind,
  resolveProviderDraftConfig,
  resolveSavedProviderDraftConfig,
  resolveThinkingValue,
} from "./threadDraftViewHelpers";
import { friendlyError } from "@/shared/messages";
import { PresentationModeTabs } from "./PresentationModeTabs";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";
import { ThreadDraftComposerArea, type DraftStartInput } from "./ThreadDraftComposerArea";
import type { ComposerControl } from "./ThreadComposer";
import { AgentDiscoveryScreen } from "./AgentDiscoveryScreen";
import {
  isDiscoveryActiveForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import {
  ThreadDraftCompactHeader,
  ThreadDraftDropIndicators,
  ThreadDraftHero,
  type ThreadDraftDropIndicator,
} from "./ThreadDraftChrome";

export function ThreadDraftView(props: {
  project: Project;
  agentStatuses: AgentStatus[];
  /**
   * True when the supervisor hasn't yet returned agent statuses for this
   * project's environment (first launch, no cache).  The composer shows a
   * "Detecting agents…" placeholder instead of the "No supported agents"
   * prompt while this is true.
   */
  isDetectingAgents?: boolean;
  lastDraftConfig?: ProjectDraftConfig;
  compact?: boolean;
  paneAlign?: "left" | "center" | "right";
  showCloseButton?: boolean;
  isDragging?: boolean;
  dropIndicator?: ThreadDraftDropIndicator;
  paneIndex?: number;
  paneCount?: number;
  /**
   * True when this draft pane sits in the top-left and there is no group header
   * above it. Adds a class so CSS can pad the header to clear the macOS
   * traffic-light controls when the sidebar is collapsed.
   */
  headerNeedsTrafficLightPad?: boolean | undefined;
  /** Pane id when rendered as a draft pane; absent for the top-level draft view. */
  paneId?: string | undefined;
  droppableRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: (() => void) | undefined;
  dragHandleRef?: React.RefCallback<Element>;
  onStart: (input: DraftStartInput) => void;
}) {
  const {
    project,
    agentStatuses,
    lastDraftConfig,
    onStart,
    headerNeedsTrafficLightPad = false,
  } = props;
  const gitBranch = useGitStore((s) => s.statuses[project.id]?.branch);
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const sharedSettingsHydrated = useSharedSettings((s) => s.sharedSettingsHydrated);
  const showAgentDiscovery = useAgentStatusesStore((s) =>
    isDiscoveryActiveForLocation(s, project.location),
  );
  const isHomeScope = isHomeProjectId(project.id);
  const scopeLabel = isHomeScope ? HOME_PROJECT_NAME : undefined;

  // Debugging showed config-only edits were rebuilding the provider/model
  // payload. Keep the installed-agent list stable unless the source inputs
  // actually change.
  const installedAgents = useMemo(
    () =>
      agentStatuses.filter((status) => status.installed && !disabledAgents.includes(status.kind)),
    [agentStatuses, disabledAgents],
  );
  const preferredAgentKind = resolvePreferredAgentKind(installedAgents, lastDraftConfig);
  const [agentKind, setAgentKind] = useState<AgentStatus["kind"] | undefined>(preferredAgentKind);
  const effectiveAgentKind = installedAgents.some((status) => status.kind === agentKind)
    ? agentKind
    : preferredAgentKind;
  const selectedAgent =
    installedAgents.find((status) => status.kind === effectiveAgentKind) ?? installedAgents[0];
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [contextSize, setContextSize] = useState<string | undefined>(undefined);
  const [fast, setFast] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<"agent" | "plan" | "autopilot">("agent");
  const [approvalPolicy, setApprovalPolicy] = useState("");
  const [sandboxMode, setSandboxMode] = useState("");
  // Not persisted across drafts — each new thread starts off.
  const [browserMcp, setBrowserMcp] = useState(false);
  const [worktreeMode, setWorktreeMode] = useState(
    isHomeScope ? false : (lastDraftConfig?.worktreeMode ?? false),
  );
  const effectiveWorktreeMode = isHomeScope ? false : worktreeMode;
  const lastAppliedAgentKindRef = useRef<AgentStatus["kind"] | undefined>(undefined);

  // Presentation-mode picker — only meaningful for adapters that advertise
  // multiple modes. The render fork in ThreadView consumes `presentationMode`
  // off the Thread row, but we resolve it here so the user's last choice for
  // this provider is remembered across new-thread drafts.
  const lastPresentationModeByAgent = useSharedSettings((s) => s.lastPresentationModeByAgent);
  const setLastPresentationMode = useSharedSettings((s) => s.setLastPresentationMode);
  const supportedPresentationModes = selectedAgent
    ? (selectedAgent.capabilities.presentationModes ?? [
        selectedAgent.capabilities.presentationMode,
      ])
    : [];
  // CLI/Chat reachability is aggregated across all installed providers — the
  // picker stays enabled whenever some provider can serve the mode, even if
  // the currently-selected one can't. Clicking an unreachable-for-this-agent
  // tab swaps to a fallback provider rather than being blocked.
  const anyAgentSupports = (presentation: ThreadPresentationMode): boolean =>
    installedAgents.some((agent) => {
      const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
      return modes.includes(presentation);
    });
  const supportsTerminalMode = anyAgentSupports("terminal");
  const supportsGuiMode = anyAgentSupports("gui");
  const supportsModePicker = supportsTerminalMode && supportsGuiMode;
  const [presentationMode, setPresentationMode] = useState<ThreadPresentationMode>(() =>
    resolveInitialPresentationMode(selectedAgent, lastPresentationModeByAgent),
  );
  const selectedAgentForConfig = useMemo(
    () => (selectedAgent ? agentWithCapabilities(selectedAgent, presentationMode) : undefined),
    [selectedAgent, presentationMode],
  );
  const previousPresentationAgentKindRef = useRef<AgentStatus["kind"] | undefined>(
    selectedAgent?.kind,
  );
  // Re-resolve when the first provider arrives after an empty draft, or on a
  // provider switch when the new provider can't serve the current mode. Why
  // this set of deps:
  //   - `lastPresentationModeByAgent` is the user's per-provider memory; we
  //     intentionally read the *latest* value at provider-switch time but
  //     don't want intra-session writes to retrigger this effect (the user
  //     hasn't changed providers, so their current selection wins).
  //   - `supportedPresentationModes` and `presentationMode` are derived from
  //     `selectedAgent` and `effectiveAgentKind`; including them would either
  //     duplicate the trigger or fire mid-edit on unrelated state.
  // Provider picks can switch CLI/Chat explicitly when the chosen provider
  // only supports the other surface; provider-change re-resolution handles the
  // same fallback for status/default changes.
  useEffect(() => {
    const previousAgentKind = previousPresentationAgentKindRef.current;
    previousPresentationAgentKindRef.current = selectedAgent?.kind;
    if (!selectedAgent) return;
    if (!previousAgentKind) {
      setPresentationMode(
        resolveInitialPresentationMode(selectedAgent, lastPresentationModeByAgent),
      );
      return;
    }
    if (supportedPresentationModes.includes(presentationMode)) return;
    setPresentationMode(resolveInitialPresentationMode(selectedAgent, lastPresentationModeByAgent));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on provider change
  }, [effectiveAgentKind]);

  // --- Per-provider config memory (app-wide via shared settings) ---
  const updateProjectDraftConfig = useAppStore((s) => s.updateProjectDraftConfig);
  const setProviderConfig = useSharedSettings((s) => s.setProviderConfig);
  const effectiveAgentKindRef = useRef(effectiveAgentKind);
  const providerConfigsRef = useRef<Record<string, ProviderDraftConfig>>({});
  const hasLocalConfigEditRef = useRef(false);
  effectiveAgentKindRef.current = effectiveAgentKind;
  // Spread is required: the effects below mutate `providerConfigsRef.current[kind]`
  // in place to keep effort/model selections in sync mid-render. Assigning the
  // store reference directly would mutate Zustand state and skip subscribers.
  providerConfigsRef.current = { ...useSharedSettings.getState().providerConfigs };

  function persistProviderConfig(providerKind: string, config: ProviderDraftConfig) {
    providerConfigsRef.current[providerKind] = config;
    if (!isHomeScope) {
      setProviderConfig(providerKind, config);
    }
  }

  function persistProjectDraftConfig(draftConfig: ProjectDraftConfig) {
    updateProjectDraftConfig(project.id, draftConfig);
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
      })
      .catch((err: unknown) => {
        console.error("[git] switch branch failed", err);
        toast.danger(friendlyError(err));
      });
  }

  useEffect(() => {
    if (effectiveAgentKind && agentKind !== effectiveAgentKind) {
      setAgentKind(effectiveAgentKind);
    }
  }, [agentKind, effectiveAgentKind]);

  useEffect(() => {
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }

    if (lastAppliedAgentKindRef.current === effectiveAgentKind) {
      return;
    }

    const saved = resolveSavedProviderDraftConfig(
      effectiveAgentKind,
      lastDraftConfig,
      isHomeScope ? {} : providerConfigsRef.current,
    );
    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, saved);
    const nextModel = resolved.model;
    const nextEffort = resolved.effort ?? "";
    const nextContext = resolved.contextSize;
    const nextFast = resolved.fast ?? false;
    const nextThinking = resolved.thinking ?? false;
    const nextMode = (resolved.mode ?? "agent") as "agent" | "plan" | "autopilot";
    const nextApproval = resolved.approvalPolicy ?? "";
    const nextSandbox = resolved.sandboxMode ?? "";

    setModel(nextModel);
    setEffort(nextEffort);
    setContextSize(nextContext);
    setFast(nextFast);
    setThinking(nextThinking);
    setMode(nextMode);
    setApprovalPolicy(nextApproval);
    setSandboxMode(nextSandbox);
    lastAppliedAgentKindRef.current = effectiveAgentKind;

    // Persist per-provider config app-wide, last-used provider per project.
    providerConfigsRef.current[effectiveAgentKind] = resolved;
    if (!isHomeScope) {
      setProviderConfig(effectiveAgentKind, resolved);
    }
    updateProjectDraftConfig(project.id, {
      agentKind: effectiveAgentKind,
      model: nextModel,
      effort: nextEffort,
      ...(nextContext ? { contextSize: nextContext } : {}),
      ...(nextFast ? { fast: nextFast } : {}),
      ...(nextThinking ? { thinking: nextThinking } : {}),
      mode: nextMode,
      approvalPolicy: nextApproval,
      sandboxMode: nextSandbox,
      worktreeMode: effectiveWorktreeMode,
    });
  }, [
    effectiveAgentKind,
    selectedAgentForConfig,
    project.id,
    lastDraftConfig,
    effectiveWorktreeMode,
    isHomeScope,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  useEffect(() => {
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }
    if (!model) {
      return;
    }

    const nextModel = resolveModelValue(selectedAgentForConfig, model);
    const nextEffort = resolveEffortValue(selectedAgentForConfig, nextModel, effort);
    const nextContext = resolveContextSizeValue(selectedAgentForConfig, nextModel, contextSize);
    const nextFast = resolveFastValue(selectedAgentForConfig, nextModel, fast);
    const nextThinking = resolveThinkingValue(selectedAgentForConfig, nextModel, thinking);
    if (
      nextModel !== model ||
      nextEffort !== effort ||
      nextContext !== contextSize ||
      nextFast !== fast ||
      nextThinking !== thinking
    ) {
      if (nextModel !== model) setModel(nextModel);
      if (nextEffort !== effort) setEffort(nextEffort);
      if (nextContext !== contextSize) setContextSize(nextContext);
      if (nextFast !== fast) setFast(nextFast);
      if (nextThinking !== thinking) setThinking(nextThinking);

      // Persist the corrected values
      const corrected: ProviderDraftConfig = {
        ...providerConfigsRef.current?.[effectiveAgentKind],
        model: nextModel,
        effort: nextEffort,
        ...(nextContext ? { contextSize: nextContext } : {}),
        ...(nextFast ? { fast: nextFast } : {}),
        ...(nextThinking ? { thinking: nextThinking } : {}),
      };
      providerConfigsRef.current[effectiveAgentKind] = corrected;
      if (!isHomeScope) {
        setProviderConfig(effectiveAgentKind, corrected);
      }
      updateProjectDraftConfig(project.id, {
        agentKind: effectiveAgentKind,
        model: nextModel,
        effort: nextEffort,
        ...(nextContext ? { contextSize: nextContext } : {}),
        ...(nextFast ? { fast: nextFast } : {}),
        ...(nextThinking ? { thinking: nextThinking } : {}),
        mode,
        approvalPolicy,
        sandboxMode,
        worktreeMode: effectiveWorktreeMode,
      });
    }
  }, [
    effort,
    contextSize,
    fast,
    thinking,
    model,
    selectedAgentForConfig,
    effectiveAgentKind,
    mode,
    approvalPolicy,
    sandboxMode,
    effectiveWorktreeMode,
    isHomeScope,
    project.id,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  useEffect(() => {
    if (isHomeScope || !sharedSettingsHydrated || hasLocalConfigEditRef.current) {
      return;
    }
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }
    if (lastDraftConfig?.agentKind === effectiveAgentKind && lastDraftConfig.model.trim()) {
      return;
    }

    const saved = useSharedSettings.getState().providerConfigs[effectiveAgentKind];
    if (!saved) {
      return;
    }
    providerConfigsRef.current = { ...useSharedSettings.getState().providerConfigs };

    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, saved);
    const nextModel = resolved.model;
    const nextEffort = resolved.effort ?? "";
    const nextContext = resolved.contextSize;
    const nextFast = resolved.fast ?? false;
    const nextThinking = resolved.thinking ?? false;
    const nextMode = (resolved.mode ?? "agent") as "agent" | "plan" | "autopilot";
    const nextApproval = resolved.approvalPolicy ?? "";
    const nextSandbox = resolved.sandboxMode ?? "";

    if (
      nextModel === model &&
      nextEffort === effort &&
      nextContext === contextSize &&
      nextFast === fast &&
      nextThinking === thinking &&
      nextMode === mode &&
      nextApproval === approvalPolicy &&
      nextSandbox === sandboxMode
    ) {
      return;
    }

    setModel(nextModel);
    setEffort(nextEffort);
    setContextSize(nextContext);
    setFast(nextFast);
    setThinking(nextThinking);
    setMode(nextMode);
    setApprovalPolicy(nextApproval);
    setSandboxMode(nextSandbox);
    lastAppliedAgentKindRef.current = effectiveAgentKind;

    if (
      saved.model !== nextModel ||
      saved.effort !== nextEffort ||
      saved.contextSize !== nextContext ||
      saved.fast !== nextFast ||
      saved.thinking !== nextThinking ||
      saved.mode !== nextMode ||
      saved.approvalPolicy !== nextApproval ||
      saved.sandboxMode !== nextSandbox
    ) {
      providerConfigsRef.current[effectiveAgentKind] = resolved;
      setProviderConfig(effectiveAgentKind, resolved);
    }

    updateProjectDraftConfig(project.id, {
      agentKind: effectiveAgentKind,
      model: nextModel,
      effort: nextEffort,
      ...(nextContext ? { contextSize: nextContext } : {}),
      ...(nextFast ? { fast: nextFast } : {}),
      ...(nextThinking ? { thinking: nextThinking } : {}),
      mode: nextMode,
      approvalPolicy: nextApproval,
      sandboxMode: nextSandbox,
      worktreeMode: effectiveWorktreeMode,
    });
  }, [
    sharedSettingsHydrated,
    selectedAgentForConfig,
    effectiveAgentKind,
    lastDraftConfig,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    mode,
    approvalPolicy,
    sandboxMode,
    project.id,
    effectiveWorktreeMode,
    isHomeScope,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  const hiddenModelIds = useSharedSettings((s) =>
    selectedAgent ? s.hiddenModels[selectedAgent.kind] : undefined,
  );
  const allHiddenModels = useSharedSettings((s) => s.hiddenModels);
  const selectedAgentFilteredCapabilities = useMemo(
    () =>
      selectedAgentForConfig
        ? filterHiddenModels(selectedAgentForConfig.capabilities, hiddenModelIds)
        : undefined,
    [selectedAgentForConfig, hiddenModelIds],
  );
  const providerModelProviders = useMemo(
    () =>
      installedAgents.map((agent) => {
        const supported = agent.capabilities.presentationModes ?? [
          agent.capabilities.presentationMode,
        ];
        const agentPresentationMode = supported.includes(presentationMode)
          ? presentationMode
          : resolveInitialPresentationMode(agent, lastPresentationModeByAgent);
        return {
          kind: agent.kind,
          label: agent.label,
          ...(agent.icon ? { icon: agent.icon } : {}),
          presentationMode: agentPresentationMode,
          capabilities: filterHiddenModels(
            capabilitiesForPresentation(agent.capabilities, agentPresentationMode),
            allHiddenModels[agent.kind],
          ),
        };
      }),
    [installedAgents, presentationMode, lastPresentationModeByAgent, allHiddenModels],
  );
  const selectedAgentKind = selectedAgent?.kind;
  const factory = useMemo(
    () => (selectedAgentKind ? getComposerControls(selectedAgentKind) : undefined),
    [selectedAgentKind],
  );
  const latestConfigPatchRef = useRef<(patch: Partial<ThreadConfig>) => void>(() => undefined);
  const latestProviderModelChangeRef = useRef<
    (next: { agentKind: string; model: string; presentationMode?: ThreadPresentationMode }) => void
  >(() => undefined);
  const onConfigPatch = (patch: Partial<ThreadConfig>) => {
    if ("browserMcp" in patch) {
      // Per-thread capability flag — not part of ProviderDraftConfig, so it
      // bypasses the resolver/persistence below.
      setBrowserMcp(patch.browserMcp === true);
      return;
    }
    if (!selectedAgentForConfig) return;
    hasLocalConfigEditRef.current = true;
    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, {
      model: patch.model ?? model,
      effort: patch.effort ?? effort,
      ...(patch.contextSize !== undefined ? { contextSize: patch.contextSize } : { contextSize }),
      ...(patch.fast !== undefined ? { fast: patch.fast } : { fast }),
      ...(patch.thinking !== undefined ? { thinking: patch.thinking } : { thinking }),
      mode: patch.mode ?? mode,
      approvalPolicy: patch.approvalPolicy ?? approvalPolicy,
      sandboxMode: patch.sandboxMode ?? sandboxMode,
    });

    setModel(resolved.model);
    setEffort(resolved.effort ?? "");
    setContextSize(resolved.contextSize);
    setFast(resolved.fast ?? false);
    setThinking(resolved.thinking ?? false);
    setMode((resolved.mode ?? "agent") as "agent" | "plan" | "autopilot");
    setApprovalPolicy(resolved.approvalPolicy ?? "");
    setSandboxMode(resolved.sandboxMode ?? "");

    // Keep local state and persisted config in one transaction so menu
    // selection animations do not receive a second delayed state update.
    if (effectiveAgentKind) {
      if (providerConfigsRef.current) {
        providerConfigsRef.current[effectiveAgentKind] = resolved;
      }
      persistProviderConfig(effectiveAgentKind, resolved);
      persistProjectDraftConfig({
        agentKind: effectiveAgentKind,
        model: resolved.model,
        effort: resolved.effort,
        ...(resolved.contextSize ? { contextSize: resolved.contextSize } : {}),
        ...(resolved.fast ? { fast: resolved.fast } : {}),
        ...(resolved.thinking ? { thinking: resolved.thinking } : {}),
        mode: resolved.mode,
        approvalPolicy: resolved.approvalPolicy,
        sandboxMode: resolved.sandboxMode,
        worktreeMode: effectiveWorktreeMode,
      });
    }
  };
  latestConfigPatchRef.current = onConfigPatch;

  latestProviderModelChangeRef.current = ({
    agentKind: nextKind,
    model: nextModel,
    presentationMode: nextPresentationMode,
  }) => {
    if (!selectedAgent) return;
    hasLocalConfigEditRef.current = true;
    const targetPresentationMode = nextPresentationMode ?? presentationMode;
    if (targetPresentationMode !== presentationMode) {
      setPresentationMode(targetPresentationMode);
    }
    if (nextKind !== selectedAgent.kind) {
      const targetAgent = installedAgents.find((agent) => agent.kind === nextKind);
      if (!targetAgent) return;
      const targetAgentForConfig = agentWithCapabilities(targetAgent, targetPresentationMode);

      if (effectiveAgentKind) {
        const snapshot: ProviderDraftConfig = {
          model,
          effort,
          ...(contextSize ? { contextSize } : {}),
          ...(fast ? { fast } : {}),
          ...(thinking ? { thinking } : {}),
          mode,
          approvalPolicy,
          sandboxMode,
        };
        persistProviderConfig(effectiveAgentKind, snapshot);
      }
      const targetSaved = isHomeScope ? undefined : providerConfigsRef.current[nextKind];
      const resolved = resolveProviderDraftConfig(targetAgentForConfig, {
        ...(targetSaved ?? {}),
        model: nextModel,
      });
      persistProviderConfig(nextKind, resolved);
      setModel(resolved.model);
      setEffort(resolved.effort ?? "");
      setContextSize(resolved.contextSize);
      setFast(resolved.fast ?? false);
      setThinking(resolved.thinking ?? false);
      setMode((resolved.mode ?? "agent") as "agent" | "plan" | "autopilot");
      setApprovalPolicy(resolved.approvalPolicy ?? "");
      setSandboxMode(resolved.sandboxMode ?? "");
      lastAppliedAgentKindRef.current = nextKind as AgentStatus["kind"];
      setAgentKind(nextKind as AgentStatus["kind"]);
      persistProjectDraftConfig({
        agentKind: nextKind as AgentStatus["kind"],
        model: resolved.model,
        effort: resolved.effort,
        ...(resolved.contextSize ? { contextSize: resolved.contextSize } : {}),
        ...(resolved.fast ? { fast: resolved.fast } : {}),
        ...(resolved.thinking ? { thinking: resolved.thinking } : {}),
        mode: resolved.mode,
        approvalPolicy: resolved.approvalPolicy,
        sandboxMode: resolved.sandboxMode,
        worktreeMode: effectiveWorktreeMode,
      });
    } else {
      latestConfigPatchRef.current({ model: nextModel });
    }
  };

  const baseDraftControls = useMemo(() => {
    if (!selectedAgent || !selectedAgentForConfig) return [];
    const filteredCaps = selectedAgentFilteredCapabilities ?? selectedAgentForConfig.capabilities;
    const providers = providerModelProviders;
    const currentEfforts = (filteredCaps.modelEfforts?.[model] ?? filteredCaps.efforts ?? []).map(
      (id) => ({
        id,
        label: formatEffortLabel(id),
      }),
    );
    const selectableEfforts = currentEfforts.length > 1 ? currentEfforts : [];
    const currentContextIds = filteredCaps.modelContextSizes?.[model];
    const currentContextSizes = currentContextIds
      ? (filteredCaps.contextSizes?.filter((c) => currentContextIds.includes(c.id)) ?? [])
      : [];
    const selectableContextSizes = currentContextSizes.length > 1 ? currentContextSizes : [];
    const supportsFast = filteredCaps.fastModels?.includes(model) ?? false;
    const supportsThinking = filteredCaps.thinkingModels?.includes(model) ?? false;
    const ctrls: ComposerControl[] = [
      {
        kind: "provider-model",
        providers,
        currentAgentKind: selectedAgent.kind,
        currentModel: model,
        presentationMode,
        hideLabelOnWrap: true,
        tier: 5,
        onChange: (next) => latestProviderModelChangeRef.current(next),
      },
    ];
    if (selectableEfforts.length > 0 || selectableContextSizes.length > 0 || supportsThinking) {
      ctrls.push({
        kind: "effort-context",
        efforts: selectableEfforts,
        ...(selectableEfforts.length > 0 && effort ? { effortValue: effort } : {}),
        onEffortChange: (value) => latestConfigPatchRef.current({ effort: value }),
        contextSizes: selectableContextSizes,
        ...(selectableContextSizes.length > 0 && contextSize ? { contextValue: contextSize } : {}),
        onContextChange: (value) => latestConfigPatchRef.current({ contextSize: value }),
        thinkingSupported: supportsThinking,
        thinkingValue: thinking,
        onThinkingChange: (value) => latestConfigPatchRef.current({ thinking: value }),
        hideLabelOnWrap: true,
        tier: 4,
        icon:
          selectableEfforts.length > 0 ? (
            <EffortIcon
              className="size-4 text-foreground"
              effort={effort}
              efforts={selectableEfforts.map((e) => e.id)}
            />
          ) : undefined,
      });
    }
    if (supportsFast) {
      ctrls.push({
        kind: "toggle",
        label: "Fast",
        icon: <Zap className="size-3.5" />,
        iconOnly: true,
        fillIconOnSelect: true,
        tier: 3,
        isSelected: fast,
        onChange: (selected) => latestConfigPatchRef.current({ fast: selected }),
      });
    }
    return ctrls;
  }, [
    selectedAgent,
    selectedAgentForConfig,
    selectedAgentFilteredCapabilities,
    providerModelProviders,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    presentationMode,
  ]);

  const providerDraftControls = useMemo(() => {
    if (!selectedAgent || !selectedAgentForConfig || !factory) return [];
    const filteredCaps = selectedAgentFilteredCapabilities ?? selectedAgentForConfig.capabilities;
    const controls = factory({
      capabilities: filteredCaps,
      config: {
        model,
        effort,
        ...(contextSize ? { contextSize } : {}),
        ...(fast ? { fast } : {}),
        ...(thinking ? { thinking } : {}),
        mode,
        approvalPolicy,
        sandboxMode,
      },
      isDisabled: false,
      onConfigChange: (patch) => latestConfigPatchRef.current(patch),
      presentationMode,
    }).map((control) => {
      let tier = control.tier;
      if (tier === undefined) {
        if (control.kind === "toggle" && (control.label === "Plan" || control.label === "Work")) {
          tier = 2;
        } else if (
          (control.kind === undefined || control.kind === "toggle" || control.kind === "menu") &&
          control.iconKind === "permission"
        ) {
          tier = 1;
        }
      }
      return { ...control, tier };
    });
    return controls;
  }, [
    selectedAgent,
    selectedAgentForConfig,
    selectedAgentFilteredCapabilities,
    factory,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    mode,
    approvalPolicy,
    sandboxMode,
    presentationMode,
  ]);

  const draftControls = useMemo(
    () => [...baseDraftControls, ...providerDraftControls],
    [baseDraftControls, providerDraftControls],
  );

  if (!selectedAgent) {
    if (props.isDetectingAgents) {
      // First-launch fancy reveal: tiles fade in as `agent-detected` events
      // arrive. Subsequent reloads (cache present, but the user opted out of
      // every agent or none are installed) fall back to the lightweight
      // pixel loader.
      if (showAgentDiscovery) {
        return <AgentDiscoveryScreen location={project.location} />;
      }
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <PixelLoader size="md" />
          <p className="text-sm text-muted">Detecting agents&hellip;</p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No supported agents detected</h1>
        <p className="text-muted">
          Install {formatAgentList(props.agentStatuses.map((s) => s.label))} to create a thread.
        </p>
      </div>
    );
  }

  const alignClass =
    props.paneAlign === "right" ? "ml-auto" : props.paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass = "px-2";

  const handlePresentationChange = (next: ThreadPresentationMode) => {
    // If the active provider can't serve this surface, swap to another
    // installed provider that can — the provider-switch effect will then
    // reload the per-provider config snapshot.
    if (!supportedPresentationModes.includes(next)) {
      const fallback = installedAgents.find((agent) => {
        const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
        return modes.includes(next);
      });
      if (!fallback) return;
      setPresentationMode(next);
      setAgentKind(fallback.kind);
      return;
    }
    setPresentationMode(next);
    // Drop config values that the new presentation surface doesn't
    // support (e.g. Codex plan mode is ACP-only).
    const normalizer = effectiveAgentKind ? getConfigNormalizer(effectiveAgentKind) : undefined;
    if (!normalizer) return;
    const patch = normalizer({
      capabilities: capabilitiesForPresentation(selectedAgent.capabilities, next),
      config: {
        model,
        effort,
        ...(contextSize ? { contextSize } : {}),
        ...(fast ? { fast } : {}),
        ...(thinking ? { thinking } : {}),
        mode,
        approvalPolicy,
        sandboxMode,
      },
      presentationMode: next,
    });
    if (Object.keys(patch).length > 0) onConfigPatch(patch);
  };

  return (
    <div
      ref={props.droppableRef}
      className={`relative flex h-full min-h-0 flex-col ${props.isDragging ? "opacity-50" : ""}`}
    >
      {props.compact && (
        <ThreadDraftCompactHeader
          alignClass={alignClass}
          dragHandleRef={props.dragHandleRef}
          headerNeedsTrafficLightPad={headerNeedsTrafficLightPad}
          onClose={props.onClose}
          projectId={project.id}
          {...(scopeLabel ? { scopeLabel } : {})}
          {...(props.paneId ? { paneId: props.paneId } : {})}
          showCloseButton={props.showCloseButton}
        />
      )}
      <div
        className={`${props.compact ? alignClass : "mx-auto justify-center"} relative flex h-full min-h-0 w-full max-w-[1040px] flex-col ${paddingClass} px-3 pb-2 ${props.compact ? "" : "pt-2"}`}
      >
        <ThreadDraftDropIndicators dropIndicator={props.dropIndicator} />
        {props.compact ? <ThreadDraftHero compact={props.compact} /> : null}

        {/* Composer at bottom */}
        <div className={`${props.compact ? alignClass : "mx-auto"} w-full max-w-[720px]`}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <ProjectSwitchMenu
              currentProjectId={project.id}
              variant="compact"
              {...(props.paneId ? { paneId: props.paneId } : {})}
            />
            <PresentationModeTabs
              presentationMode={presentationMode}
              supportsTerminal={supportsTerminalMode}
              supportsGui={supportsGuiMode}
              onChange={handlePresentationChange}
            />
          </div>
          <ThreadDraftComposerArea
            project={project}
            {...(props.paneId ? { paneId: props.paneId } : {})}
            selectedAgent={selectedAgent}
            controls={draftControls}
            config={{
              model,
              ...(effort ? { effort } : {}),
              ...(contextSize ? { contextSize } : {}),
              ...(fast ? { fast } : {}),
              ...(thinking ? { thinking } : {}),
              ...(mode ? { mode } : {}),
              ...(approvalPolicy ? { approvalPolicy } : {}),
              ...(sandboxMode ? { sandboxMode } : {}),
              ...(browserMcp ? { browserMcp: true } : {}),
            }}
            compact={props.compact}
            paneCount={props.paneCount}
            gitBranch={gitBranch}
            worktreeMode={effectiveWorktreeMode}
            supportsModePicker={supportsModePicker}
            presentationMode={presentationMode}
            onConfigChange={onConfigPatch}
            onWorktreeModeChange={setWorktreeMode}
            onSwitchBranch={handleSwitchBranch}
            onRememberPresentationMode={() => {
              setLastPresentationMode(selectedAgent.kind, presentationMode);
            }}
            onStart={onStart}
          />
        </div>
      </div>
    </div>
  );
}
