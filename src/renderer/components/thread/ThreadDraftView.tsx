import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type {
  AgentStatus,
  BuiltInMcpServerId,
  Project,
  ProjectDraftConfig,
  ProviderDraftConfig,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { HOME_PROJECT_NAME, isHomeProjectId } from "@/shared/homeScope";
import { readBridge } from "@/renderer/bridge";
import { getComputerUseScope } from "@/renderer/components/composer/computerUseScope";
import {
  chromeMcpServer,
  COMPUTER_USE_MCP_ID,
  resolveMcpScope,
} from "@/renderer/components/composer/composerMcpServers";
import { getConfigNormalizer } from "@/renderer/components/providers/providerComposer";
import { useGitStore } from "@/renderer/state/gitStore";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { capabilitiesForPresentation, filterHiddenModels } from "@/shared/agentSelection";
import {
  appendProviderComposerControls,
  buildModelPickerControls,
  buildProviderModelMenuProviders,
  patchConfigForModelChange,
} from "./buildModelPickerControls";
import {
  agentWithCapabilities,
  formatAgentList,
  resolveContextSizeValue,
  resolveEffortValue,
  resolveFastValue,
  resolveInitialPresentationMode,
  resolveModelValue,
  resolvePreferredAgentKind,
  resolveProviderDraftConfig,
  resolveSavedProviderDraftConfig,
  supportsUsableFastMode,
  resolveThinkingValue,
} from "./threadDraftViewHelpers";
import { friendlyError } from "@/shared/messages";
import { PresentationModeTabs } from "./PresentationModeTabs";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";
import { ThreadDraftComposerArea, type DraftStartInput } from "./ThreadDraftComposerArea";
import type { SaveClipboardImage } from "../composer/useAttachments";
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Minimum gap kept above the composer once it can no longer stay centered. */
const COMPOSER_ANCHOR_MIN_TOP = 8;

/**
 * Keeps the centered draft composer visually *stable* instead of re-centering on
 * every height change. The composer starts vertically centered, then the top
 * edge of the input is locked to that initial line: typing extra rows grows the
 * box downward (top stays put), while rows that appear above the input (slash
 * command panel, attachments, docks) grow the box upward (the input + toolbar
 * stay put). Implemented by driving the height of a spacer above the block so
 * the input's top edge holds a fixed fraction of the container height.
 */
function useStableComposerAnchor(opts: {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  blockRef: React.RefObject<HTMLDivElement | null>;
  spacerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { enabled, containerRef, blockRef, spacerRef } = opts;
  // Fraction of the container height where the input's top edge is pinned.
  // Captured once from the initial centered layout so window resizes keep the
  // composer at the same relative position.
  const anchorRatioRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const block = blockRef.current;
    const spacer = spacerRef.current;
    if (!container || !block || !spacer) return;

    const apply = () => {
      const height = container.clientHeight;
      if (height <= 0) return;
      const containerTop = container.getBoundingClientRect().top;
      const blockTop = block.getBoundingClientRect().top;
      const inputEl = block.querySelector<HTMLElement>("[data-composer-input-anchor]");
      const inputTop = (inputEl ?? block).getBoundingClientRect().top;
      // Distance from the block's top to the input's top — grows when rows are
      // inserted above the input (command panel, attachments, docks).
      const aboveInput = inputTop - blockTop;
      const blockHeight = block.offsetHeight;

      // Establish the anchor once from the initial (centered) layout: the line
      // the input's top edge would sit on if the block were centered.
      if (anchorRatioRef.current === null) {
        const centeredInputOffset = (height - blockHeight) / 2 + aboveInput;
        anchorRatioRef.current = clampNumber(centeredInputOffset / height, 0, 1);
      }

      const desiredInputOffset = Math.round(anchorRatioRef.current * height);
      const currentInputOffset = inputTop - containerTop;
      const currentSpacer = spacer.offsetHeight;
      const maxSpacer = Math.max(COMPOSER_ANCHOR_MIN_TOP, height - blockHeight);
      // Snap to whole pixels. A fractional spacer height (e.g. 443.5px) reads
      // back from offsetHeight rounded, so the next correction measures a stale
      // value and the input/toolbar drift by a sub-pixel each time the box
      // changes height (the toolbar visibly creeping up as the slash panel opens).
      const nextSpacer = Math.round(
        clampNumber(
          currentSpacer + (desiredInputOffset - currentInputOffset),
          COMPOSER_ANCHOR_MIN_TOP,
          maxSpacer,
        ),
      );
      // Integer guard: only write on a whole-pixel change, never feed a fraction
      // back into the ResizeObserver loop.
      if (Math.abs(nextSpacer - currentSpacer) >= 1) {
        spacer.style.height = `${nextSpacer}px`;
      }
    };

    apply();
    const observer = new ResizeObserver(() => apply());
    observer.observe(container);
    observer.observe(block);
    return () => observer.disconnect();
  }, [enabled, containerRef, blockRef, spacerRef]);
}

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
  quickComposer?: boolean;
  composerPlaceholder?: string;
  restoreWorktreeSelectionToken?: number;
  /** Override whether unmodified Enter submits instead of inserting a newline. */
  submitOnEnter?: boolean;
  pickFiles?: () => Promise<string[] | null>;
  saveClipboardImage?: SaveClipboardImage;
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
  onProjectChange?: (projectId: string) => void;
  onStart: (input: DraftStartInput) => void | Promise<void>;
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
  const remoteConnection = useRemoteServersStore((state) => {
    const { remoteServerId } = project;
    if (!remoteServerId) return "local";
    if (!state.servers.some((server) => server.desktopId === remoteServerId)) return "missing";
    return state.runtime[remoteServerId]?.status ?? "connecting";
  });

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
  const [contextSize, setContextSize] = useState<string | undefined>(() => {
    if (
      lastDraftConfig &&
      lastDraftConfig.agentKind === preferredAgentKind &&
      lastDraftConfig.contextSize
    ) {
      return lastDraftConfig.contextSize;
    }
    if (!preferredAgentKind || isHomeScope) return undefined;
    return useSharedSettings.getState().providerConfigs[preferredAgentKind]?.contextSize;
  });
  const [fast, setFast] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<"agent" | "plan" | "autopilot">("agent");
  const [approvalPolicy, setApprovalPolicy] = useState("");
  const [approvalsReviewer, setApprovalsReviewer] = useState("");
  const [sandboxMode, setSandboxMode] = useState("");
  // Per-draft `@`-mentions of a composer MCP. These are NOT the persistent
  // enablement (that lives in `enabledMcpServers`); they capture a one-off
  // mention in this draft and reset with every new thread. The effective launch
  // flag is `mention || (persistent && scope available)`, computed below.
  const [browserMcpMention, setBrowserMcpMention] = useState(false);
  const [crossagentMcpMention, setCrossagentMcpMention] = useState(false);
  const [chromeMcpMention, setChromeMcpMention] = useState(false);
  const [computerUseMention, setComputerUseMention] = useState(false);
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
  // Persistent composer MCP enablement (standing default across new threads).
  const enabledMcpServers = useSharedSettings((s) => s.enabledMcpServers);
  const disabledBuiltInMcpServers = useSharedSettings((s) => s.disabledBuiltInMcpServers);
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
  const initialLastDraftConfigRef = useRef(lastDraftConfig);
  const hasLocalConfigEditRef = useRef(false);
  const hasLocalContextEditRef = useRef(false);
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
    const nextReviewer = resolved.approvalsReviewer ?? "";
    const nextSandbox = resolved.sandboxMode ?? "";

    setModel(nextModel);
    setEffort(nextEffort);
    setContextSize(nextContext);
    setFast(nextFast);
    setThinking(nextThinking);
    setMode(nextMode);
    setApprovalPolicy(nextApproval);
    setApprovalsReviewer(nextReviewer);
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
      ...(resolved.fast !== undefined ? { fast: resolved.fast } : {}),
      ...(resolved.thinking !== undefined ? { thinking: resolved.thinking } : {}),
      mode: nextMode,
      approvalPolicy: nextApproval,
      approvalsReviewer: nextReviewer,
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
        fast: nextFast,
        thinking: nextThinking,
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
        fast: nextFast,
        thinking: nextThinking,
        mode,
        approvalPolicy,
        approvalsReviewer,
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
    approvalsReviewer,
    sandboxMode,
    effectiveWorktreeMode,
    isHomeScope,
    project.id,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  useEffect(() => {
    if (isHomeScope || !sharedSettingsHydrated) {
      return;
    }
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }
    const initialLastDraftConfig = initialLastDraftConfigRef.current;
    const hasInitialProjectDraft =
      initialLastDraftConfig?.agentKind === effectiveAgentKind &&
      Boolean(initialLastDraftConfig.model.trim());
    const hasInitialContext = hasInitialProjectDraft && Boolean(initialLastDraftConfig.contextSize);
    const shouldInheritContext = !hasInitialContext && !hasLocalContextEditRef.current;
    if (hasLocalConfigEditRef.current && !shouldInheritContext) {
      return;
    }
    if (hasInitialContext) {
      return;
    }

    const providerConfigs = useSharedSettings.getState().providerConfigs;
    const providerConfig = providerConfigs[effectiveAgentKind];
    if (!providerConfig) {
      return;
    }
    providerConfigsRef.current = { ...providerConfigs };

    if (hasLocalConfigEditRef.current) {
      const nextContext = resolveContextSizeValue(
        selectedAgentForConfig,
        model,
        providerConfig.contextSize,
      );
      if (nextContext === contextSize) {
        return;
      }
      setContextSize(nextContext);
      updateProjectDraftConfig(project.id, {
        agentKind: effectiveAgentKind,
        model,
        effort,
        ...(nextContext ? { contextSize: nextContext } : {}),
        ...(supportsUsableFastMode(selectedAgentForConfig.capabilities, model) ? { fast } : {}),
        ...(selectedAgentForConfig.capabilities.thinkingModels?.includes(model)
          ? { thinking }
          : {}),
        mode,
        approvalPolicy,
        approvalsReviewer,
        sandboxMode,
        worktreeMode: effectiveWorktreeMode,
      });
      return;
    }

    const saved = hasInitialProjectDraft
      ? resolveSavedProviderDraftConfig(effectiveAgentKind, initialLastDraftConfig, providerConfigs)
      : providerConfig;
    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, saved);
    const nextModel = resolved.model;
    const nextEffort = resolved.effort ?? "";
    const nextContext = resolved.contextSize;
    const nextFast = resolved.fast ?? false;
    const nextThinking = resolved.thinking ?? false;
    const nextMode = (resolved.mode ?? "agent") as "agent" | "plan" | "autopilot";
    const nextApproval = resolved.approvalPolicy ?? "";
    const nextReviewer = resolved.approvalsReviewer ?? "";
    const nextSandbox = resolved.sandboxMode ?? "";

    if (
      nextModel === model &&
      nextEffort === effort &&
      nextContext === contextSize &&
      nextFast === fast &&
      nextThinking === thinking &&
      nextMode === mode &&
      nextApproval === approvalPolicy &&
      nextReviewer === approvalsReviewer &&
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
    setApprovalsReviewer(nextReviewer);
    setSandboxMode(nextSandbox);
    lastAppliedAgentKindRef.current = effectiveAgentKind;

    if (
      !hasInitialProjectDraft &&
      (providerConfig.model !== nextModel ||
        providerConfig.effort !== nextEffort ||
        providerConfig.contextSize !== nextContext ||
        providerConfig.fast !== nextFast ||
        providerConfig.thinking !== nextThinking ||
        providerConfig.mode !== nextMode ||
        providerConfig.approvalPolicy !== nextApproval ||
        providerConfig.approvalsReviewer !== nextReviewer ||
        providerConfig.sandboxMode !== nextSandbox)
    ) {
      providerConfigsRef.current[effectiveAgentKind] = resolved;
      setProviderConfig(effectiveAgentKind, resolved);
    }

    updateProjectDraftConfig(project.id, {
      agentKind: effectiveAgentKind,
      model: nextModel,
      effort: nextEffort,
      ...(nextContext ? { contextSize: nextContext } : {}),
      ...(resolved.fast !== undefined ? { fast: resolved.fast } : {}),
      ...(resolved.thinking !== undefined ? { thinking: resolved.thinking } : {}),
      mode: nextMode,
      approvalPolicy: nextApproval,
      approvalsReviewer: nextReviewer,
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
    approvalsReviewer,
    sandboxMode,
    project.id,
    effectiveWorktreeMode,
    isHomeScope,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  const hiddenModelIds = useSharedSettings((s) =>
    selectedAgent
      ? s.hiddenModels[
          modelVisibilityKey(
            selectedAgent.kind,
            presentationMode,
            selectedAgentForConfig?.capabilities.runtimeLabel,
          )
        ]
      : undefined,
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
      buildProviderModelMenuProviders(installedAgents, {
        resolvePresentationMode: (agent) => {
          const supported = agent.capabilities.presentationModes ?? [
            agent.capabilities.presentationMode,
          ];
          return supported.includes(presentationMode)
            ? presentationMode
            : resolveInitialPresentationMode(agent, lastPresentationModeByAgent);
        },
        hiddenModelsByAgent: allHiddenModels,
      }),
    [installedAgents, presentationMode, lastPresentationModeByAgent, allHiddenModels],
  );
  const latestConfigPatchRef = useRef<(patch: Partial<ThreadConfig>) => void>(() => undefined);
  const latestProviderModelChangeRef = useRef<
    (next: { agentKind: string; model: string; presentationMode?: ThreadPresentationMode }) => void
  >(() => undefined);
  const onConfigPatch = (patch: Partial<ThreadConfig>) => {
    if ("browserMcp" in patch) {
      // Per-draft mention flag — not part of ProviderDraftConfig, so it bypasses
      // the resolver/persistence below. Set by an `@browser` mention, cleared by
      // removing its composer chip.
      setBrowserMcpMention(patch.browserMcp === true);
      return;
    }
    if ("crossagentMcp" in patch) {
      // Per-draft mention flag — same bypass as browserMcp above.
      setCrossagentMcpMention(patch.crossagentMcp === true);
      return;
    }
    if ("chromeMcp" in patch) {
      // Per-draft mention flag — same bypass as browserMcp above.
      setChromeMcpMention(patch.chromeMcp === true);
      return;
    }
    if ("computerUse" in patch) {
      // Per-draft mention flag — same bypass as browserMcp above.
      setComputerUseMention(patch.computerUse === true);
      return;
    }
    if (!selectedAgentForConfig) return;
    hasLocalConfigEditRef.current = true;
    if ("contextSize" in patch) {
      hasLocalContextEditRef.current = true;
    }
    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, {
      model: patch.model ?? model,
      effort: patch.effort ?? effort,
      ...(patch.contextSize !== undefined ? { contextSize: patch.contextSize } : { contextSize }),
      ...(patch.fast !== undefined ? { fast: patch.fast } : { fast }),
      ...(patch.thinking !== undefined ? { thinking: patch.thinking } : { thinking }),
      mode: patch.mode ?? mode,
      approvalPolicy: patch.approvalPolicy ?? approvalPolicy,
      approvalsReviewer: patch.approvalsReviewer ?? approvalsReviewer,
      sandboxMode: patch.sandboxMode ?? sandboxMode,
    });

    setModel(resolved.model);
    setEffort(resolved.effort ?? "");
    setContextSize(resolved.contextSize);
    setFast(resolved.fast ?? false);
    setThinking(resolved.thinking ?? false);
    setMode((resolved.mode ?? "agent") as "agent" | "plan" | "autopilot");
    setApprovalPolicy(resolved.approvalPolicy ?? "");
    setApprovalsReviewer(resolved.approvalsReviewer ?? "");
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
        ...(resolved.fast !== undefined ? { fast: resolved.fast } : {}),
        ...(resolved.thinking !== undefined ? { thinking: resolved.thinking } : {}),
        mode: resolved.mode,
        approvalPolicy: resolved.approvalPolicy,
        approvalsReviewer: resolved.approvalsReviewer,
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
    if (!selectedAgent || !selectedAgentForConfig) return;
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
          fast,
          thinking,
          mode,
          approvalPolicy,
          approvalsReviewer,
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
      setApprovalsReviewer(resolved.approvalsReviewer ?? "");
      setSandboxMode(resolved.sandboxMode ?? "");
      lastAppliedAgentKindRef.current = nextKind as AgentStatus["kind"];
      setAgentKind(nextKind as AgentStatus["kind"]);
      persistProjectDraftConfig({
        agentKind: nextKind as AgentStatus["kind"],
        model: resolved.model,
        effort: resolved.effort,
        ...(resolved.contextSize ? { contextSize: resolved.contextSize } : {}),
        ...(resolved.fast !== undefined ? { fast: resolved.fast } : {}),
        ...(resolved.thinking !== undefined ? { thinking: resolved.thinking } : {}),
        mode: resolved.mode,
        approvalPolicy: resolved.approvalPolicy,
        approvalsReviewer: resolved.approvalsReviewer,
        sandboxMode: resolved.sandboxMode,
        worktreeMode: effectiveWorktreeMode,
      });
    } else {
      latestConfigPatchRef.current(
        patchConfigForModelChange(selectedAgentForConfig.capabilities, nextModel, {
          ...(effort ? { effort } : {}),
          ...(contextSize ? { contextSize } : {}),
        }),
      );
    }
  };

  const baseDraftControls = useMemo(() => {
    if (!selectedAgent || !selectedAgentForConfig) return [];
    const filteredCaps = selectedAgentFilteredCapabilities ?? selectedAgentForConfig.capabilities;
    return buildModelPickerControls({
      providers: providerModelProviders,
      selectedAgentKind: selectedAgent.kind,
      model,
      effort,
      ...(contextSize ? { contextSize } : {}),
      fast,
      thinking,
      capabilities: filteredCaps,
      presentationMode,
      onProviderModelChange: (next) => latestProviderModelChangeRef.current(next),
      onConfigPatch: (patch) => latestConfigPatchRef.current(patch),
    });
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
    if (!selectedAgent || !selectedAgentForConfig) return [];
    const filteredCaps = selectedAgentFilteredCapabilities ?? selectedAgentForConfig.capabilities;
    return appendProviderComposerControls([], {
      agentKind: selectedAgent.kind,
      capabilities: filteredCaps,
      config: {
        model,
        effort,
        ...(contextSize ? { contextSize } : {}),
        ...(fast ? { fast } : {}),
        ...(thinking ? { thinking } : {}),
        mode,
        approvalPolicy,
        approvalsReviewer,
        sandboxMode,
      },
      presentationMode,
      isDisabled: false,
      onConfigChange: (patch) => latestConfigPatchRef.current(patch),
    });
  }, [
    selectedAgent,
    selectedAgentForConfig,
    selectedAgentFilteredCapabilities,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    mode,
    approvalPolicy,
    approvalsReviewer,
    sandboxMode,
    presentationMode,
  ]);

  const draftControls = useMemo(
    () => [...baseDraftControls, ...providerDraftControls],
    [baseDraftControls, providerDraftControls],
  );

  // Stable centering for the full (non-compact) draft view: center once, then
  // pin the input's top edge so the composer no longer jumps when it grows.
  // Declared before the early returns below to keep hook order consistent.
  const anchorContainerRef = useRef<HTMLDivElement>(null);
  const anchorBlockRef = useRef<HTMLDivElement>(null);
  const anchorSpacerRef = useRef<HTMLDivElement>(null);
  useStableComposerAnchor({
    // Agent detection can render the draft view before the composer DOM exists.
    // Only arm the anchor once the selected-agent branch can actually mount it.
    enabled: !props.compact && !props.quickComposer && !!selectedAgent,
    containerRef: anchorContainerRef,
    blockRef: anchorBlockRef,
    spacerRef: anchorSpacerRef,
  });

  if (remoteConnection === "connecting") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <PixelLoader size="md" />
        <p className="text-sm text-muted">
          <Trans>Connecting…</Trans>
        </p>
      </div>
    );
  }
  if (remoteConnection !== "local" && remoteConnection !== "online") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Trans>Connection error</Trans>
        </h1>
        <p className="text-muted">
          <Trans>This project's remote server is offline. Reconnect it to start a thread.</Trans>
        </p>
      </div>
    );
  }

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
          <p className="text-sm text-muted">
            <Trans>Detecting agents…</Trans>
          </p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Trans>No supported agents detected</Trans>
        </h1>
        <p className="text-muted">
          <Trans>
            Install {formatAgentList(props.agentStatuses.map((s) => s.label))} to create a thread.
          </Trans>
        </p>
      </div>
    );
  }

  const alignClass =
    props.paneAlign === "right" ? "ml-auto" : props.paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass = "px-2";
  const compactComposer = props.compact || props.quickComposer;
  // The quick-composer surface renders width-hugging chrome-free, so it opts out
  // of the full-height sizing, max-widths, and padding the standard/compact views use.
  const rootSizeClass = props.quickComposer ? "w-full" : "h-full min-h-0";
  const bodySizeClass = props.quickComposer ? "w-full" : "h-full min-h-0 w-full max-w-[1040px]";
  const bodyPaddingClass = props.quickComposer
    ? ""
    : `${paddingClass} px-3 pb-2 ${props.compact ? "" : "pt-2"}`;
  const blockMaxWidthClass = props.quickComposer ? "" : "max-w-[720px]";

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
        approvalsReviewer,
        sandboxMode,
      },
      presentationMode: next,
    });
    if (Object.keys(patch).length > 0) onConfigPatch(patch);
  };

  // Effective launch flag for each composer MCP: a per-draft `@`-mention OR a
  // persistent standing default whose scope the current provider/presentation
  // actually supports. A persistent enable with a "none" scope must NOT set the
  // config flag — otherwise the composer would show a phantom "on" state and the
  // scope-reset effect there would fight it.
  const hostPlatform = readBridge()?.platform;
  const effectiveMcp = (id: BuiltInMcpServerId, mention: boolean, scope: string) =>
    disabledBuiltInMcpServers[id] !== true &&
    (mention || (enabledMcpServers[id] === true && scope !== "none"));
  const selectedMcpScope = resolveMcpScope(selectedAgent.capabilities.mcpScope, presentationMode);
  const effectiveBrowserMcp = effectiveMcp("browser", browserMcpMention, selectedMcpScope);
  const effectiveCrossagentMcp = effectiveMcp(
    "crossagents",
    crossagentMcpMention,
    selectedMcpScope,
  );
  const effectiveChromeMcp = effectiveMcp(
    "chrome",
    chromeMcpMention,
    chromeMcpServer.getScope(selectedAgent.capabilities, presentationMode, project.location),
  );
  const effectiveComputerUse = effectiveMcp(
    COMPUTER_USE_MCP_ID,
    computerUseMention,
    getComputerUseScope(
      selectedAgent.capabilities,
      presentationMode,
      project.location,
      hostPlatform,
    ),
  );

  return (
    <div
      ref={props.droppableRef}
      className={`relative flex ${rootSizeClass} flex-col ${props.isDragging ? "opacity-50" : ""}`}
    >
      <ThreadDraftDropIndicators dropIndicator={props.dropIndicator} />
      {props.compact && !props.quickComposer && (
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
        ref={compactComposer ? undefined : anchorContainerRef}
        data-draft-body=""
        className={`${compactComposer ? alignClass : "mx-auto"} relative flex ${bodySizeClass} flex-col ${bodyPaddingClass}`}
      >
        {props.quickComposer ? null : props.compact ? (
          <ThreadDraftHero compact={props.compact} />
        ) : (
          // Spacer whose height is driven by useStableComposerAnchor to keep the
          // composer centered initially, then anchored as it grows.
          <div
            ref={anchorSpacerRef}
            aria-hidden
            className="w-full shrink-0"
            data-draft-composer-anchor-spacer=""
          />
        )}

        {/* Composer block: centered initially, then anchored by the input's top edge. */}
        <div
          ref={compactComposer ? undefined : anchorBlockRef}
          className={`${compactComposer ? alignClass : "mx-auto shrink-0"} w-full ${blockMaxWidthClass} ${props.quickComposer ? "quick-composer-control-surface" : ""}`}
        >
          <div data-draft-controls="" className="mb-1 flex items-center justify-between gap-2">
            <ProjectSwitchMenu
              currentProjectId={project.id}
              variant="compact"
              {...(props.paneId ? { paneId: props.paneId } : {})}
              {...(props.onProjectChange ? { onSelectProject: props.onProjectChange } : {})}
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
            isRemote={project.remoteServerId !== undefined}
            {...(props.paneId ? { paneId: props.paneId } : {})}
            {...(props.restoreWorktreeSelectionToken !== undefined
              ? { restoreWorktreeSelectionToken: props.restoreWorktreeSelectionToken }
              : {})}
            selectedAgent={selectedAgentForConfig ?? selectedAgent}
            controls={draftControls}
            config={{
              model,
              ...(effort ? { effort } : {}),
              ...(contextSize ? { contextSize } : {}),
              ...(selectedAgentForConfig &&
              supportsUsableFastMode(selectedAgentForConfig.capabilities, model)
                ? { fast }
                : {}),
              ...(thinking ? { thinking } : {}),
              ...(mode ? { mode } : {}),
              ...(approvalPolicy ? { approvalPolicy } : {}),
              ...(approvalsReviewer ? { approvalsReviewer } : {}),
              ...(sandboxMode ? { sandboxMode } : {}),
              ...(effectiveBrowserMcp ? { browserMcp: true } : {}),
              ...(effectiveCrossagentMcp ? { crossagentMcp: true } : {}),
              ...(effectiveChromeMcp ? { chromeMcp: true } : {}),
              ...(effectiveComputerUse ? { computerUse: true } : {}),
            }}
            compact={compactComposer}
            paneCount={props.paneCount}
            gitBranch={gitBranch}
            worktreeMode={effectiveWorktreeMode}
            supportsModePicker={supportsModePicker}
            presentationMode={presentationMode}
            {...(props.composerPlaceholder ? { placeholder: props.composerPlaceholder } : {})}
            {...(props.submitOnEnter !== undefined ? { submitOnEnter: props.submitOnEnter } : {})}
            {...(props.pickFiles ? { pickFiles: props.pickFiles } : {})}
            {...(props.saveClipboardImage ? { saveClipboardImage: props.saveClipboardImage } : {})}
            onConfigChange={onConfigPatch}
            onWorktreeModeChange={setWorktreeMode}
            onSwitchBranch={handleSwitchBranch}
            onRememberPresentationMode={() => {
              setLastPresentationMode(selectedAgent.kind, presentationMode);
            }}
            onStart={onStart}
          />
        </div>
        {/* Absorbs the slack below the anchored composer in the full draft view. */}
        {compactComposer ? null : (
          <div aria-hidden data-draft-slack="" className="min-h-0 w-full flex-1" />
        )}
      </div>
    </div>
  );
}
